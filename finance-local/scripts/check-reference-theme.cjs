const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
const read = name => readFileSync(resolve(root, name), 'utf8').replace(/\r\n/g, '\n');
const before = read('backups/reference-theme-20260919/index.html');
const after = read('index.html');
const scripts = html => [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(match => match[0]);
assert.deepEqual(scripts(after), scripts(before), 'Every dashboard script must be byte-identical');
const unthemed = after.replace(/<!-- BEGIN BATERIKU REFERENCE THEME -->[\s\S]*?<!-- END BATERIKU REFERENCE THEME -->\n/, '')
  .replace('<div class="brand" aria-label="Bateriku Ledger Finance Workspace"><span class="brand-mark" aria-label="Bateriku Ledger">BL</span><div><strong>FINANCE WORKSPACE</strong><small>Developed by Muhamad Amir Khalil</small></div></div>', '<div class="brand"><span class="brand-mark" aria-label="Bateriku Ledger">BL</span><div><strong>Bateriku Ledger</strong><small>Finance Control</small></div></div>');
assert.equal(unthemed, before, 'Everything except the isolated style and branding must be identical');
assert.equal(after, read('cloudflare/public/index.html'), 'Generated dashboard must match source');
const worker = read('cloudflare/src/worker.js').replace(/    \/\* BEGIN BATERIKU REFERENCE LOGIN THEME[\s\S]*?    \/\* END BATERIKU REFERENCE LOGIN THEME \*\/\n/, '');
assert.equal(worker, read('backups/reference-theme-20260919/worker.js'), 'Worker must differ only by marked CSS');
console.log('PASS: scripts, tables, filters, markup, worker/auth logic unchanged; generated mirror matches.');
