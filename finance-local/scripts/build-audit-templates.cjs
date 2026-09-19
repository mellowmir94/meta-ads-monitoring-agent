const { readFileSync, writeFileSync, copyFileSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
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
const start = html.indexOf('      // BEGIN TABLE FILTER TEMPLATES');
const end = html.indexOf('      // END TABLE FILTER TEMPLATES', start);
if (start < 0 || end < 0) throw new Error('Missing audit template embed markers');
const moduleCode = ['audit-templates.js', 'deductions.js', 'commission-kpi-comparison.js'].map(name => readFileSync(resolve(root, name), 'utf8').trim()).join('\n');
writeFileSync(file, html.slice(0, start) + '      // BEGIN TABLE FILTER TEMPLATES\n' + moduleCode + '\n' + html.slice(end));
copyFileSync(file, resolve(root, 'cloudflare/public/index.html'));
