const path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {Miniflare,convertV4MiniflareOptions}=require('../../daily-report-html/node_modules/miniflare');
const esbuild=require('../node_modules/esbuild');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const bundle=await esbuild.build({entryPoints:[path.join(root,'cloudflare/src/worker.js')],bundle:true,write:false,format:'esm',platform:'browser'});
  // Bundled local workerd supports 2026-08-11; production keeps its configured date.
  const config={modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-08-11',durableObjects:{DEDUCTIONS:{className:'DeductionRegister',useSQLite:true}},r2Buckets:['DEDUCTION_BACKUPS']};
  const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(config):config);
  try{
    const {bookingColumns,bookingsApi,restoreBookingBackup}=await import(pathToFileURL(path.join(root,'cloudflare/src/bookings.js')));
    const namespace=await mf.getDurableObjectNamespace('DEDUCTIONS'),bucket=await mf.getR2Bucket('DEDUCTION_BACKUPS'),actor={name:'Storage Test',sessionId:'storage-test'};
    const env={
      DEDUCTIONS:{
        idFromName:name=>namespace.idFromName(name),
        get:id=>({fetch:async request=>namespace.get(id).fetch(request.url,{
          method:request.method,headers:Object.fromEntries(request.headers),
          ...(request.method==='POST'?{body:await request.text()}:{})
        })})
      },
      DEDUCTION_BACKUPS:bucket
    };
    const rows=Array.from({length:10026},(_,i)=>({...Object.fromEntries(bookingColumns.map(k=>[k,''])),order_id:String(i+1),created_at:'2026-09-20 10:00:00',request_at:'2026-09-21 00:00:00',rider_name:'TEST RIDER '+i,branch_name:'TEST BRANCH',products:'TEST PRODUCT',order_status:'ready_to_dispatch',payment_status:'Pending',paymenttotal:200,commission:35,quantity:1}));
    const input={rows,sourceWeek:'2026-09-14',filename:'storage-test.xlsx'};
    const call=async(action,data)=>{const result=await bookingsApi(new Request('https://ledger.test/api/bookings/'+action,{method:'POST',headers:{origin:'https://ledger.test','content-type':'application/json'},body:JSON.stringify(data)}),env,actor);const body=await result.json();assert.equal(result.status,200,body.error);return body;};
    const started=Date.now(),preview=await call('preview',input);assert.equal(preview.counts.new,10026);
    const saved=await call('import',{...input,expectedRevision:preview.revision});assert.ok(!saved.backupWarning,saved.backupWarning);assert.equal(saved.new,10026);
    const keys=await bucket.list({prefix:'booking-jobs/snapshots/v1/'}),manifestObject=keys.objects.find(o=>o.key.includes('/manifest-'));assert.ok(manifestObject);const manifest=await(await bucket.get(manifestObject.key)).json();
    const recovered=new Map(),store={list:async()=>new Map(recovered),put:async(k,v)=>recovered.set(k,v),transaction:async fn=>fn(store)};
    await restoreBookingBackup(store,manifest,async key=>(await bucket.get(key)).json());assert.equal([...recovered.keys()].filter(k=>k.startsWith('booking:')).length,10026);
    const repeat=await call('import',{...input,expectedRevision:preview.revision});assert.equal(repeat.repeated,true);
    console.log('PASS: local Cloudflare SQLite runtime imported 10,026 bookings, wrote '+manifest.parts.length+' backup parts, restored all records, and retried without duplicates in '+((Date.now()-started)/1000).toFixed(1)+'s. No production writes.');
  }finally{await mf.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
