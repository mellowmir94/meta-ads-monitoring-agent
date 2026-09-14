import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
export const workspaceCss = fs.readFileSync(path.join(root, 'src/workspace-enhancements.css'), 'utf8');
export const workspaceApp = fs.readFileSync(path.join(root, 'vendor/workspace-icons.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/workspace-enhancements.js'), 'utf8');
export function enhanceWorkspace(html) {
  // Dashboard JavaScript includes literal HTML fragments. Replace only the
  // final document tags, never a matching string in an inline script.
  // The source app builds a finalised-report HTML string that contains a later
  // `</head>` literal. The document head is the first closing head tag; body
  // must remain the final closing body tag.
  var head = html.indexOf('</head>'), body = html.lastIndexOf('</body>');
  if (head < 0 || body < 0 || body < head) throw new Error('Dashboard template is missing its final document tags.');
  return html.slice(0, head) + '<style data-workspace-enhancements>' + workspaceCss + '</style>\n' + html.slice(head, body) + '<script>' + workspaceApp.replace(/<\/script/gi, '<\\/script') + '</script>\n' + html.slice(body);
}
export function masterReviewApp() { return fs.readFileSync(path.join(root, 'src/master-review.js'), 'utf8'); }
export function operationsHtml(logo, xlsx) {
  return fs.readFileSync(path.join(root, 'src/operations-centre.html'), 'utf8')
    .replace('/* OPERATIONS_CSS */', () => fs.readFileSync(path.join(root, 'src/operations-centre.css'), 'utf8'))
    .replace('/* INLINE_LOGO */', () => logo)
    .replace('/* OPERATIONS_ICONS */', () => fs.readFileSync(path.join(root, 'vendor/workspace-icons.js'), 'utf8'))
    .replace('/* INLINE_XLSX */', () => xlsx)
    .replace('/* MASTER_REVIEW */', () => masterReviewApp().replace(/<\/script/gi, '<\\/script'))
    .replace('/* OPERATIONS_APP */', () => fs.readFileSync(path.join(root, 'src/operations-centre.js'), 'utf8').replace(/<\/script/gi, '<\\/script'));
}
