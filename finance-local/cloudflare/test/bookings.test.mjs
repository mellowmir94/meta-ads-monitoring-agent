import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingColumns,bookingWeek,handleBookings,bookingsApi,restoreBookingBackup} from '../src/bookings.js';
import {DeductionRegister} from '../src/deductions.js';
import {createDeductionSnapshot,validateDeductionSnapshot,restoreDeductionSnapshot} from '../src/deduction-backup.js';
export class BookingTestStore {
  data=new Map();
  async get(key){return structuredClone(this.data.get(key));}
  async put(key,value){this.data.set(key,structuredClone(value));}
  async list({prefix='',startAfter='',limit=Infinity}={}){return new Map([...this.data].filter(([key])=>key.startsWith(prefix)&&key>startAfter).sort(([a],[b])=>a<b?-1:a>b?1:0).slice(0,limit).map(([key,value])=>[key,structuredClone(value)]));}
  async transaction(fn){const before=structuredClone(this.data);try{return await fn(this);}catch(error){this.data=before;throw error;}}
}
const actor={name:'Finance',sessionId:'test'};
const source=(id='123',changes={})=>({...Object.fromEntries(bookingColumns.map(k=>[k,''])),order_id:id,Rider_ID:'1',rider_name:'Rider A',branch_name:'HQ',products:'Battery',created_at:'2026-09-20 10:00:00',request_at:'2026-09-21 00:00:00',order_status:'ready_to_dispatch',payment_status:'Pending',paymenttotal:200,commission:35,quantity:1,...changes});
async function call(store,path,input){const res=await handleBookings(store,new Request('https://test/booking/'+path,input?{method:'POST',body:JSON.stringify(input)}:{}),actor,'2026-09-21T01:00:00Z');return {status:res.status,...await res.json()};}
async function importRows(store,rows,week='2026-09-14'){const input={rows,filename:'Week38.xlsx',sourceWeek:week};const preview=await call(store,'preview',input);return call(store,'import',{...input,expectedRevision:preview.revision});}
test('preview is read-only, first import saves, repeat is idempotent, dates imply Week 39',async()=>{
 const store=new BookingTestStore();const preview=await call(store,'preview',{rows:[source()],filename:'Week38.xlsx',sourceWeek:'2026-09-14'});assert.equal(preview.counts.new,1);assert.equal(store.data.size,0);
 const first=await importRows(store,[source()]),again=await importRows(store,[source()]);assert.equal(first.status,200);assert.equal(again.repeated,true);assert.equal((await store.list({prefix:'booking:'})).size,1);
 const record=await store.get('booking:123');assert.equal(record.assignedWeek,'2026-09-21');assert.equal(record.createdWeek,'2026-09-14');assert.equal(record.originalWeek,'2026-09-14');assert.equal(bookingWeek('2026-09-27'),'2026-09-21');assert.equal(bookingWeek('2026-09-28'),'2026-09-28');
});
test('reimport updates source, retains originals and absent rows, preserves Finance assignment',async()=>{
 const store=new BookingTestStore();await importRows(store,[source(),source('456')]);const record=await store.get('booking:123');
 const update={id:'123',date:'2026-09-29',note:'Customer postponed',reviewed:true,expectedVersion:record.version,requestId:crypto.randomUUID()};assert.equal((await call(store,'update',update)).status,200);assert.equal((await call(store,'update',update)).status,200);
 await importRows(store,[source('123',{request_at:'2026-09-28',commission:45})],'2026-09-21');const latest=await store.get('booking:123');assert.equal(latest.source.commission,45);assert.equal(latest.original.commission,35);assert.equal(latest.assignedWeek,'2026-09-28');assert.equal(latest.assignedDate,'2026-09-29');assert.equal(latest.reviewed,false);assert.equal(latest.rescheduleCount,1);assert.ok(await store.get('booking:456'));assert.equal((await call(store,'detail?id=123')).history.length,3);
});
test('invalid and duplicate rows block the entire import; stale previews cannot overwrite updates',async()=>{
 const store=new BookingTestStore();let result=await importRows(store,[source(),source()]);assert.equal(result.status,400);assert.equal(store.data.size,0);
 result=await importRows(store,[source(),source('2',{commission:'bad'})]);assert.equal(result.status,400);assert.equal(store.data.size,0);
 await importRows(store,[source()]);result=await call(store,'import',{rows:[source('3')],filename:'x.xlsx',sourceWeek:'2026-09-14',expectedRevision:0});assert.equal(result.status,400);assert.ok(!await store.get('booking:3'));
});
test('conflicts retain source dates; statuses and zero values are preserved',async()=>{
 const store=new BookingTestStore();await importRows(store,[source('1',{request_at:'2027-11-14',dispatched_on:'2026-09-20',order_status:'completed',paymenttotal:0}),source('2',{request_at:'',order_status:'cancelled'})]);
 const completed=await store.get('booking:1');assert.ok(completed.reviewReasons.length>=2);assert.equal(completed.source.request_at,'2027-11-14');assert.equal(completed.source.paymenttotal,0);const cancelled=await store.get('booking:2');assert.equal(cancelled.assignedWeek,'');assert.equal(cancelled.source.order_status,'cancelled');
});
test('bookings and audits survive paginated backup and restore without changing deductions',async()=>{
 const store=new BookingTestStore();await store.put('counter:reference',203);await importRows(store,Array.from({length:520},(_,i)=>source(String(i+1))));assert.equal(await store.get('counter:reference'),203);assert.equal((await store.list({prefix:'record:'})).size,0);
 const snapshot=await createDeductionSnapshot(store);await validateDeductionSnapshot(snapshot);const restored=new BookingTestStore();await restoreDeductionSnapshot(restored,snapshot);assert.equal((await restored.list({prefix:'booking:'})).size,520);assert.equal((await restored.list({prefix:'booking-event:'})).size,520);
 let cursor='',count=0;do{const result=await call(store,'list'+(cursor?'?after='+encodeURIComponent(cursor):''));count+=result.records.length;cursor=result.next;}while(cursor);assert.equal(count,520);
});
test('gateway requires authentication and same origin; confirmed saves use existing R2 backup',async()=>{
 const store=new BookingTestStore(),register=new DeductionRegister({storage:store}),backups=[];const env={DEDUCTIONS:{idFromName:x=>x,get:()=>register},DEDUCTION_BACKUPS:{put:async(key,value)=>backups.push(JSON.parse(value))}};
 const input={rows:[source()],filename:'x.xlsx',sourceWeek:'2026-09-14',expectedRevision:0};const request=()=>new Request('https://ledger.test/api/bookings/import',{method:'POST',headers:{origin:'https://ledger.test','content-type':'application/json'},body:JSON.stringify(input)});
 assert.equal((await bookingsApi(request(),env,null)).status,401);const bad=request();bad.headers.set('origin','https://other.test');assert.equal((await bookingsApi(bad,env,actor)).status,403);assert.equal((await bookingsApi(request(),env,actor)).status,200);assert.equal(backups.length,2);const restored=new BookingTestStore();await restoreBookingBackup(restored,backups[1],async()=>backups[0]);assert.equal((await restored.list({prefix:'booking:'})).size,1);
});
