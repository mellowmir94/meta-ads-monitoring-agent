const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'cloudflare/src/deduction-workflow.js'), 'utf8').replace(/export /g, '');
const asset = '(() => {\n' + core + '\nwindow.LedgerHistoryWorkflow = { installmentCompleted, batchStage, installmentMatches };\n})();\n';
for (const file of ['cloudflare/public/assets/history-workflow.js', 'assets/history-workflow.js']) fs.writeFileSync(path.join(root, file), asset);
for (const file of ['cloudflare/public/index.html', 'index.html']) {
  const location = path.join(root, file), html = fs.readFileSync(location, 'utf8').replaceAll('\r\n', '\n');
  const start = html.indexOf('// Embedded in the dashboard'), end = html.indexOf('function deductionHistoryFilters(view)', start);
  if (start < 0 || end < start) throw Error('Workflow markers missing');
  fs.writeFileSync(location, html.slice(0, start) + fs.readFileSync(path.join(root, 'history-workflow-ui.js'), 'utf8') + '\n' + html.slice(end));
}
const published = fs.readFileSync(path.join(root, 'cloudflare/public/index.html'), 'utf8');
const deductionStart = published.indexOf('// Table-scoped shortcuts'), deductionEnd = published.indexOf('// Exact fallback comparison', deductionStart);
if (deductionStart < 0 || deductionEnd < deductionStart) throw Error('Deduction module markers missing');
fs.writeFileSync(path.join(root, 'deductions.js'), published.slice(deductionStart, deductionEnd).trim() + '\n');
const styleStart = published.indexOf('<!-- BEGIN DEDUCTION STYLES -->'), styleEnd = published.indexOf('<!-- END DEDUCTION STYLES -->', styleStart);
fs.writeFileSync(path.join(root, 'deductions.css'), [...published.slice(styleStart, styleEnd).matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1].trim()).join('\n') + '\n');
