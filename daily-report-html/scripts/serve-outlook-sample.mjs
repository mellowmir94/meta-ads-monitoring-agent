import http from 'node:http';
import fs from 'node:fs/promises';
const fragment = await fs.readFile(new URL('../artifacts/workflow/outlook-paste-sample.html', import.meta.url), 'utf8');
const serialized = JSON.stringify(fragment).replace(/</g, '\\u003c');
const page = `<!doctype html><meta charset="utf-8"><title>Outlook paste verification - sample data</title>
<style>body{font:16px Arial;padding:24px;color:#142d41}button{padding:12px;font:inherit}iframe{display:block;width:100%;height:65vh;margin-top:20px;border:1px solid #bbb}</style>
<h1>Outlook paste verification</h1><p>Sample data only. No recipients.</p><button id="copy">Copy formatted sample</button><span id="status" role="status"></span><iframe title="Sample report" src="/preview"></iframe>
<script>document.getElementById('copy').onclick=async()=>{try{await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([${serialized}],{type:'text/html'}),'text/plain':new Blob(['Sample report for paste verification'],{type:'text/plain'})})]);document.getElementById('status').textContent='Sample copied';}catch(e){document.getElementById('status').textContent=e.message}};</script>`;
http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(request.url === '/preview' ? fragment : page);
}).listen(Number(process.env.PORT || 8798), '127.0.0.1', () => console.log('Outlook sample: http://127.0.0.1:' + (process.env.PORT || 8798)));
