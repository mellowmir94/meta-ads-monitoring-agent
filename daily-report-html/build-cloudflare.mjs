import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { enhanceWorkspace, workspaceCss, workspaceApp, masterReviewApp, operationsHtml } from './build-workspace.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(root, '..');
const publicDir = path.join(root, 'cloudflare', 'public');
const uploadDir = path.join(publicDir, 'upload');

fs.mkdirSync(uploadDir, { recursive: true });

const logo = fs.readFileSync(path.join(process.env.USERPROFILE || workspaceRoot, 'Pictures', 'Battery Images', 'Logo_RGB_Bateriku+2025-23_logo_432x320-2510860063-removebg-preview.png')).toString('base64');

// The hosted dashboard never parses Excel directly; workbook uploads happen in
// the protected upload centre. Excluding SheetJS saves about 860 KB from every
// dashboard page load while the standalone desktop HTML remains self-contained.
const dashboardTemplate = fs.readFileSync(path.join(root, 'src', 'dashboard.html'), 'utf8');
const dashboardCss = fs.readFileSync(path.join(root, 'src', 'dashboard.css'), 'utf8');
const dashboardApp = fs.readFileSync(path.join(root, 'src', 'dashboard.js'), 'utf8');
const buildId = createHash('sha256').update(dashboardTemplate).update(dashboardCss).update(dashboardApp).update(workspaceCss).update(workspaceApp).digest('hex').slice(0, 12);
const dashboardHtml = dashboardTemplate
  .replace('/* INLINE_CSS */', () => dashboardCss)
  .replace('/* INLINE_LOGO */', () => logo)
  .replace('/* INLINE_XLSX */', '/* Excel parsing is provided by the protected upload centre. */')
  .replace('/* INLINE_APP */', () => `window.__DASHBOARD_BUILD_ID__ = ${JSON.stringify(buildId)};\n${dashboardApp.replace(/<\/script/gi, '<\\/script')}`);
fs.writeFileSync(path.join(publicDir, 'index.html'), enhanceWorkspace(dashboardHtml), 'utf8');
fs.writeFileSync(path.join(publicDir, 'version.json'), JSON.stringify({ buildId, builtAt: new Date().toISOString() }), 'utf8');

// The hosted upload centre starts empty and loads the protected current
// workbook from /api/data. Never bake a company workbook into a public asset.
const uploadTemplate = fs.readFileSync(path.join(root, 'src', 'data-upload-centre.html'), 'utf8');
const uploadCss = fs.readFileSync(path.join(root, 'src', 'data-upload-centre.css'), 'utf8');
const uploadApp = fs.readFileSync(path.join(root, 'src', 'data-upload-centre.js'), 'utf8');
const xlsx = fs.readFileSync(path.join(workspaceRoot, 'public', 'vendor', 'xlsx.full.min.js'), 'utf8');
const emptyWorkbook = { sourceFile: 'No workbook loaded', loadedAt: '', sheets: {} };
const uploadHtml = uploadTemplate
  .replace('/* INLINE_CSS */', () => uploadCss)
  .replace('/* INLINE_LOGO */', () => logo)
  .replace('/* INLINE_XLSX */', () => xlsx)
  .replace('/* INITIAL_DATA */', () => JSON.stringify(emptyWorkbook))
  .replace('/* INLINE_APP */', () => (masterReviewApp() + '\n' + uploadApp).replace(/<\/script/gi, '<\\/script'));
fs.writeFileSync(path.join(uploadDir, 'index.html'), uploadHtml, 'utf8');
fs.mkdirSync(path.join(uploadDir, 'operations'), { recursive: true });
fs.writeFileSync(path.join(uploadDir, 'operations', 'index.html'), operationsHtml(logo, xlsx), 'utf8');

fs.writeFileSync(path.join(publicDir, '404.html'), '<!doctype html><meta charset="utf-8"><title>Not found</title><p>Page not found. <a href="/">Open dashboard</a>.</p>', 'utf8');
console.log(`Prepared Cloudflare assets in ${publicDir}`);
