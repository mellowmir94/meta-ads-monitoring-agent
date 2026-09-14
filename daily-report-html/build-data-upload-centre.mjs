import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { masterReviewApp } from './build-workspace.mjs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDir, '..');
const sourcePath = process.env.DAILY_REPORT_WORKBOOK || path.join(process.env.USERPROFILE || workspaceRoot, 'Desktop', 'Daily Report Email 2026.xlsx');
const templatePath = path.join(currentDir, 'src', 'data-upload-centre.html');
const cssPath = path.join(currentDir, 'src', 'data-upload-centre.css');
const appPath = path.join(currentDir, 'src', 'data-upload-centre.js');
const xlsxPath = path.join(workspaceRoot, 'public', 'vendor', 'xlsx.full.min.js');
const logoPath = path.join(process.env.USERPROFILE || workspaceRoot, 'Pictures', 'Battery Images', 'Logo_RGB_Bateriku+2025-23_logo_432x320-2510860063-removebg-preview.png');
const outputPath = path.join(currentDir, 'dist', 'Data Upload Centre.html');
const desktopOutputPath = path.join(process.env.USERPROFILE || workspaceRoot, 'Desktop', 'Data Upload Centre.html');
const sheetNames = ['Pitstop Master'];
const sheetAliases = { BGarage: ['BGarage', 'BGarange', 'B Garage', 'B Garange', 'Garage'], Indonesia: ['Indonesia', 'Bateriku Indonesia', 'Indonesia Sales'], 'Pitstop Master': ['Pitstop Master', 'Pitstop_Master', 'PitstopMaster', 'Master Pitstop'] };
const require = createRequire(import.meta.url);
const XLSX = require(xlsxPath);

let initial = { sourceFile: 'No workbook loaded', loadedAt: '', sheets: {} };
if (process.env.EMBED_INITIAL_WORKBOOK !== '0' && fs.existsSync(sourcePath)) {
  const workbook = XLSX.read(fs.readFileSync(sourcePath), { type: 'buffer', cellDates: false });
  sheetNames.forEach((name) => {
    const aliases = sheetAliases[name] || [name];
    const sheetName = aliases.find((candidate) => workbook.Sheets[candidate]);
    if (sheetName) initial.sheets[name] = { rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true }) };
  });
  const updated = fs.statSync(sourcePath).mtime;
  initial.sourceFile = path.basename(sourcePath);
  initial.loadedAt = updated.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const template = fs.readFileSync(templatePath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const xlsx = fs.readFileSync(xlsxPath, 'utf8');
const logo = fs.readFileSync(logoPath).toString('base64');
const html = template
  .replace('/* INLINE_CSS */', () => css)
  .replace('/* INLINE_LOGO */', () => logo)
  .replace('/* INLINE_XLSX */', () => xlsx)
  .replace('/* INITIAL_DATA */', () => JSON.stringify(initial).replace(/<\/script/gi, '<\\/script'))
  .replace('/* INLINE_APP */', () => (masterReviewApp() + '\n' + app).replace(/<\/script/gi, '<\\/script'));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');
if (process.env.SKIP_DESKTOP_COPY !== '1') fs.copyFileSync(outputPath, desktopOutputPath);
console.log(`Created ${outputPath}`);
if (process.env.SKIP_DESKTOP_COPY !== '1') console.log(`Copied ${desktopOutputPath}`);
console.log(`Source: ${sourcePath}`);
console.log(`Size: ${fs.statSync(outputPath).size} bytes`);
