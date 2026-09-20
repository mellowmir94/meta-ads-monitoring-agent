const { readFileSync, writeFileSync, copyFileSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
copyFileSync(resolve(root, 'assets/finsight-data.js'), resolve(root, 'cloudflare/public/assets/finsight-data.js'));
const file = resolve(root, 'index.html');
let html = readFileSync(file, 'utf8');
const cssStart = '<!-- BEGIN DEDUCTION STYLES -->';
const cssEnd = '<!-- END DEDUCTION STYLES -->';
const style = cssStart + '\n<style>\n' + readFileSync(resolve(root, 'deductions.css'), 'utf8') + '\n</style>\n' + cssEnd;
if (html.includes(cssStart)) {
  html = html.slice(0, html.indexOf(cssStart)) + style + html.slice(html.indexOf(cssEnd) + cssEnd.length);
} else html = html.replace('</head>', style + '\n</head>');
// Optional, isolated presentation layer; remove its embedded block to roll back.
const themeStart = '<!-- BEGIN BATERIKU REFERENCE THEME -->';
const themeEnd = '<!-- END BATERIKU REFERENCE THEME -->';
const logoDataUrl = 'data:image/png;base64,' + readFileSync(resolve(root, 'cloudflare/public/assets/bateriku-finance-logo.png')).toString('base64');
const themeCss = readFileSync(resolve(root, 'bateriku-reference-theme.css'), 'utf8').replace('__BATERIKU_LOGO_DATA_URL__', logoDataUrl);
const themeStyle = themeStart + '\n<style>\n' + themeCss + '\n</style>\n' + themeEnd;
if (html.includes(themeStart)) {
  html = html.slice(0, html.indexOf(themeStart)) + themeStyle + html.slice(html.indexOf(themeEnd) + themeEnd.length);
} else html = html.replace('</head>', themeStyle + '\n</head>');
const finsightStyleStart = '<!-- BEGIN LEDGER FINSIGHT STYLES -->';
const finsightStyleEnd = '<!-- END LEDGER FINSIGHT STYLES -->';
const finsightStyle = finsightStyleStart + '\n<style>\n' + readFileSync(resolve(root, 'finsight-ledger.css'), 'utf8') + '\n</style>\n' + finsightStyleEnd;
if (html.includes(finsightStyleStart)) {
  html = html.slice(0, html.indexOf(finsightStyleStart)) + finsightStyle + html.slice(html.indexOf(finsightStyleEnd) + finsightStyleEnd.length);
} else html = html.replace('</head>', finsightStyle + '\n</head>');
const finsightRuntimeStart = '<!-- BEGIN LEDGER FINSIGHT RUNTIME -->';
const finsightRuntimeEnd = '<!-- END LEDGER FINSIGHT RUNTIME -->';
const finsightRuntime = finsightRuntimeStart + '\n<script>\n' + readFileSync(resolve(root, 'assets/finsight-data.js'), 'utf8') + '\n' + readFileSync(resolve(root, 'finsight-ledger.js'), 'utf8') + '\n</script>\n' + finsightRuntimeEnd;
if (html.includes(finsightRuntimeStart)) {
  html = html.slice(0, html.indexOf(finsightRuntimeStart)) + finsightRuntime + html.slice(html.indexOf(finsightRuntimeEnd) + finsightRuntimeEnd.length);
} else html = html.replace('</body>', finsightRuntime + '\n</body>');
const start = html.indexOf('      // BEGIN TABLE FILTER TEMPLATES');
const end = html.indexOf('      // END TABLE FILTER TEMPLATES', start);
if (start < 0 || end < 0) throw new Error('Missing audit template embed markers');
const moduleCode = ['audit-templates.js', 'deductions.js', 'commission-kpi-comparison.js'].map(name => readFileSync(resolve(root, name), 'utf8').trim()).join('\n');
writeFileSync(file, html.slice(0, start) + '      // BEGIN TABLE FILTER TEMPLATES\n' + moduleCode + '\n' + html.slice(end));
copyFileSync(file, resolve(root, 'cloudflare/public/index.html'));
