export const bookingColumns = ['Rider_ID','order_id','parent_id','created_at','request_at','dispatched_on','rider_name','arrival_status','order_status','vpn','branch_name','products','battery_size','vehicle_name','promocode','level','payment_type','sales_source','paymenttotal','payment_status','quantity','commission'];
const response = (body,status=200) => Response.json(body,{status,headers:{'cache-control':'no-store'}});
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');
export function bookingDay(value) {
  const day=String(value||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day+'T00:00:00Z')) && new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day ? day : '';
}
export function bookingWeek(day) {
  if(!bookingDay(day))return '';
  const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.toISOString().slice(0,10);
}
export function bookingIssues(source) {
  const created=bookingDay(source.created_at),scheduled=bookingDay(source.request_at),dispatch=bookingDay(source.dispatched_on),issues=[];
  for(const field of ['paymenttotal','commission','quantity'])if(source[field]===null||source[field]===undefined||source[field]==='')issues.push('Missing '+field+' in source');
  if(!created)issues.push('Missing or invalid created date');
  if(!scheduled)issues.push('Missing or invalid scheduled date');
  if(source.dispatched_on&&!dispatch)issues.push('Invalid dispatch date');
  if(scheduled&&created&&scheduled<created)issues.push('Scheduled date is before the created date');
  if(dispatch&&created&&dispatch<created)issues.push('Dispatch date is before the created date');
  if(dispatch&&scheduled&&dispatch<scheduled)issues.push('Dispatch date is before the scheduled date');
  if(scheduled&&created&&(Date.parse(scheduled)-Date.parse(created))/86400000>60)issues.push('Scheduled date is more than 60 days after creation');
  return issues;
}
function normalizeRows(input) {
  if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>25000)throw Error('Upload between 1 and 25,000 source rows.');
  if(!bookingDay(input.sourceWeek)||bookingWeek(input.sourceWeek)!==input.sourceWeek)throw Error('Choose a Monday for the source week.');
  if(typeof input.filename!=='string'||!input.filename.trim()||input.filename.length>250)throw Error('A source filename is required.');
  const seen=new Set(),rows=[],invalid=[];
  input.rows.forEach((row,index)=>{
    try {
      if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid source row');
      const normalized={};
      for(const key of bookingColumns){
        const value=row[key];
        if(value!==null&&value!==undefined&&!['string','number'].includes(typeof value))throw Error('Invalid '+key);
        if(['paymenttotal','commission','quantity'].includes(key)){
          if(value===null||value===undefined||value===''){normalized[key]=null;continue;}
          if(!Number.isFinite(Number(value))||Math.abs(Number(value))>1e10)throw Error('Invalid '+key);
          normalized[key]=Number(value);
        } else {normalized[key]=String(value??'').trim();if(normalized[key].length>1000)throw Error(key+' is too long');}
      }
      if(!/^[A-Za-z0-9_-]{1,80}$/.test(normalized.order_id))throw Error('Missing or invalid order_id');
      if(seen.has(normalized.order_id))throw Error('Duplicate order_id '+normalized.order_id+' in this workbook');
      seen.add(normalized.order_id);rows.push(normalized);
    }catch(error){invalid.push({row:index+2,error:error.message});}
  });
  return {rows,invalid};
}
async function listAll(storage,prefix) {
  const records=[];let after='';
  do {const page=[...await storage.list({prefix,limit:500,...(after?{startAfter:after}:{})})];records.push(...page);after=page.length===500?page.at(-1)[0]:'';}while(after);
  return records;
}
async function plan(storage,input) {
  const {rows,invalid}=normalizeRows(input),existing=new Map(await listAll(storage,'booking:')),counts={total:input.rows.length,new:0,updated:0,unchanged:0,invalid:invalid.length,needsReview:0},sample=[];
  for(const source of rows){
    const previous=existing.get('booking:'+source.order_id),kind=!previous?'new':JSON.stringify(previous.source)===JSON.stringify(source)?'unchanged':'updated';counts[kind]++;
    const issues=bookingIssues(source);if(issues.length)counts.needsReview++;
    if(sample.length<30)sample.push({orderId:source.order_id,rider:source.rider_name,scheduled:source.request_at,kind,issues});
  }
  return {rows,invalid,counts,sample,revision:Number(await storage.get('counter:booking-revision')||0)};
}
export async function handleBookings(storage,request,actor,now=new Date().toISOString()) {
  const url=new URL(request.url),path=url.pathname;
  try {
    if(request.method==='GET'&&path==='/booking/backup-page'&&request.headers.get('x-deduction-internal')==='1'){
      return storage.transaction(async tx=>{const after=url.searchParams.get('after')||'',entries=[...await tx.list({limit:1000,...(after?{startAfter:after}:{})})];return response({revision:Number(await tx.get('counter:booking-revision')||0),entries,next:entries.length===1000?entries.at(-1)[0]:null});});
    }
    if(request.method==='GET'&&path==='/booking/list'){
      const after=url.searchParams.get('after')||'';if(after&&!/^booking:[A-Za-z0-9_-]+$/.test(after))throw Error('Invalid cursor');
      return storage.transaction(async tx=>{
        const page=[...await tx.list({prefix:'booking:',limit:201,...(after?{startAfter:after}:{})})];
        return response({records:page.slice(0,200).map(([,r])=>({...r,original:undefined})),next:page.length>200?page[199][0]:null,revision:Number(await tx.get('counter:booking-revision')||0),latest:await tx.get('booking-meta:latest')||null});
      });
    }
    if(request.method==='GET'&&path==='/booking/detail'){
      const id=url.searchParams.get('id');if(!/^[A-Za-z0-9_-]{1,80}$/.test(id||''))throw Error('Invalid Order ID');
      const record=await storage.get('booking:'+id);if(!record)return response({error:'Booking not found'},404);
      return response({record,history:(await listAll(storage,'booking-event:'+id+':')).map(([,value])=>value)});
    }
    if(request.method!=='POST'||!['/booking/preview','/booking/import','/booking/update'].includes(path))return response({error:'Booking action not found'},404);
    const input=await request.json();
    if(path==='/booking/preview'){const result=await storage.transaction(tx=>plan(tx,input));return response({...result,rows:undefined});}
    if(path==='/booking/import'){
      const key='booking-import:'+await hash({rows:input.rows,sourceWeek:input.sourceWeek});
      const result=await storage.transaction(async tx=>{
        const previousReceipt=await tx.get(key);if(previousReceipt)return {...previousReceipt,repeated:true};
        const proposal=await plan(tx,input);
        if(proposal.invalid.length)throw Error('Import blocked: fix every invalid or duplicate row and preview again.');
        if(input.expectedRevision!==proposal.revision)throw Error('Bookings changed after the preview. Preview the workbook again before saving.');
        const revision=proposal.revision+1,importId=key.slice('booking-import:'.length);
        for(const source of proposal.rows){
          const recordKey='booking:'+source.order_id,previous=await tx.get(recordKey),issues=bookingIssues(source);
          const changedDates=previous&&(['created_at','request_at','dispatched_on','order_status'].some(k=>source[k]!==previous.source[k])||JSON.stringify(previous.reviewReasons)!==JSON.stringify(issues));
          const override=previous?.override||null,assignedDate=override?.date||bookingDay(source.request_at),assignedWeek=bookingWeek(assignedDate);
          const changed=!previous||JSON.stringify(previous.source)!==JSON.stringify(source);
          const record={...previous,id:source.order_id,source,original:previous?.original||source,originalWeek:previous?.originalWeek||input.sourceWeek,createdWeek:bookingWeek(source.created_at.slice(0,10))||input.sourceWeek,assignedDate,assignedWeek,override,reviewReasons:issues,reviewed:changedDates?false:previous?.reviewed||false,firstFilename:previous?.firstFilename||input.filename,sourceFilename:input.filename,lastImportId:importId,lastSeenAt:now,updatedAt:changed?now:previous.updatedAt,version:(previous?.version||0)+1,rescheduleCount:(previous?.rescheduleCount||0)+(previous&&previous.assignedWeek!==assignedWeek?1:0)};
          await tx.put(recordKey,record);
          if(changed)await tx.put('booking-event:'+record.id+':'+String(revision).padStart(12,'0'),{at:now,by:actor.name,action:previous?'Source updated':'Imported',filename:input.filename,fromWeek:previous?.assignedWeek||'',toWeek:assignedWeek,changes:bookingColumns.filter(k=>!previous||source[k]!==previous.source[k]).map(field=>({field,from:previous?.source[field]??null,to:source[field]}))});
        }
        const receipt={...proposal.counts,revision,importId,filename:input.filename,sourceWeek:input.sourceWeek,at:now,by:actor.name};
        await tx.put(key,receipt);await tx.put('booking-meta:latest',receipt);await tx.put('counter:booking-revision',revision);await tx.put('counter:revision',Number(await tx.get('counter:revision')||0)+1);return receipt;
      });return response(result);
    }
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(input.id||'')||!bookingDay(input.date)||typeof input.note!=='string'||!input.note.trim()||input.note.length>1000||!/^[a-z0-9-]{16,80}$/i.test(input.requestId||''))throw Error('A valid date, Order ID, note and request ID are required.');
    const signature=await hash(input);
    const result=await storage.transaction(async tx=>{
      const receiptKey='booking-receipt:'+input.requestId,prior=await tx.get(receiptKey);if(prior){if(prior.signature!==signature)throw Error('Request ID already used');return prior.result;}
      const key='booking:'+input.id,record=await tx.get(key);if(!record)throw Error('Booking not found');
      if(input.expectedVersion!==record.version)throw Error('This booking changed. Reopen Details before saving.');
      const revision=Number(await tx.get('counter:booking-revision')||0)+1,assignedWeek=bookingWeek(input.date);
      const updated={...record,assignedDate:input.date,assignedWeek,override:{date:input.date,note:input.note.trim(),by:actor.name,at:now},reviewed:input.reviewed===true,version:record.version+1,updatedAt:now,rescheduleCount:record.rescheduleCount+(assignedWeek!==record.assignedWeek?1:0)};
      await tx.put(key,updated);await tx.put('booking-event:'+input.id+':'+String(revision).padStart(12,'0'),{at:now,by:actor.name,action:'Finance assignment',fromWeek:record.assignedWeek,toWeek:assignedWeek,fromDate:record.assignedDate,toDate:input.date,note:input.note.trim(),reviewed:updated.reviewed});
      await tx.put('counter:booking-revision',revision);await tx.put('counter:revision',Number(await tx.get('counter:revision')||0)+1);
      const result={saved:true};await tx.put(receiptKey,{signature,result});return result;
    });return response(result);
  }catch(error){return response({error:error.message||'Unable to process bookings'},400);}
}

export async function bookingsApi(request,env,actor) {
  if(!actor?.sessionId||!actor.name)return response({error:'Sign in to Finance first.'},401);
  if(!env.DEDUCTIONS)return response({error:'Booking storage is unavailable.'},503);
  const url=new URL(request.url),action=url.pathname.slice('/api/bookings'.length)||'/list';
  if(!['/list','/detail','/preview','/import','/update'].includes(action))return response({error:'Not found'},404);
  const read=['/list','/detail'].includes(action);
  if(request.method!==(read?'GET':'POST'))return response({error:'Method not allowed'},405);
  if(!read&&(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json')))return response({error:'Same-origin JSON required'},403);
  const body=read?undefined:await request.text();if(body&&new TextEncoder().encode(body).length>16000000)return response({error:'Workbook data exceeds the 16 MB import limit.'},413);
  const headers={'content-type':'application/json','x-deduction-session':actor.sessionId,'x-deduction-user':actor.name,'x-deduction-role':actor.role||'maker','x-deduction-internal':'1'},stub=env.DEDUCTIONS.get(env.DEDUCTIONS.idFromName('finance-bookings-v1'));
  const result=await stub.fetch(new Request('https://deductions.internal/booking'+action+url.search,{method:request.method,headers,...(body?{body}:{})}));
  if(result.ok&&['/import','/update'].includes(action)&&env.DEDUCTION_BACKUPS?.put){
    const saved=await result.json();
    try {
      const manifest={schema:'finance-booking-jobs',version:1,revision:null,createdAt:new Date().toISOString(),parts:[]};let after='';
      do {
        const snap=await stub.fetch(new Request('https://deductions.internal/booking/backup-page'+(after?'?after='+encodeURIComponent(after):''),{headers}));if(!snap.ok)throw Error('Snapshot unavailable');const part=await snap.json();
        if(manifest.revision!==null&&part.revision!==manifest.revision)throw Error('Bookings changed during backup');manifest.revision=part.revision;
        const checksum=await hash(part),key='booking-jobs/snapshots/v1/'+String(part.revision).padStart(12,'0')+'/'+String(manifest.parts.length).padStart(5,'0')+'-'+checksum+'.json';
        await env.DEDUCTION_BACKUPS.put(key,JSON.stringify(part),{httpMetadata:{contentType:'application/json'}});manifest.parts.push({key,checksum,count:part.entries.length});after=part.next;
      }while(after);
      const manifestKey='booking-jobs/snapshots/v1/'+String(manifest.revision).padStart(12,'0')+'/manifest-'+await hash(manifest)+'.json';
      await env.DEDUCTION_BACKUPS.put(manifestKey,JSON.stringify(manifest),{httpMetadata:{contentType:'application/json'}});
    }
    catch {return response({...saved,backupWarning:'Saved centrally. The backup needs retry; contact the administrator.'});}
    return response(saved,result.status);
  }
  return result;
}

// Offline recovery only: validate every immutable part before restoring an empty store.
export async function restoreBookingBackup(storage,manifest,readPart) {
  if(manifest?.schema!=='finance-booking-jobs'||manifest.version!==1||!Number.isInteger(manifest.revision)||!Array.isArray(manifest.parts)||!manifest.parts.length)throw Error('Invalid Booking Jobs backup manifest');
  const entries=new Map();let previous='';
  for(const descriptor of manifest.parts){const part=await readPart(descriptor.key);if(await hash(part)!==descriptor.checksum||part.revision!==manifest.revision||part.entries.length!==descriptor.count)throw Error('Booking backup part failed validation');
    for(const entry of part.entries){if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||entry[0]<=previous||!/^(booking:|booking-event:|booking-import:|booking-meta:|booking-receipt:|counter:)/.test(entry[0]))throw Error('Invalid booking backup entry');entries.set(entry[0],entry[1]);previous=entry[0];}
  }
  if(entries.get('counter:booking-revision')!==manifest.revision)throw Error('Incomplete booking backup');
  await storage.transaction(async tx=>{if((await tx.list({limit:1})).size)throw Error('Restore requires an empty store');for(const [key,value]of entries)await tx.put(key,value);});return {records:[...entries.keys()].filter(k=>k.startsWith('booking:')).length};
}
