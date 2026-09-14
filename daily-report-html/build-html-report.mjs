import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enhanceWorkspace } from './build-workspace.mjs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDir, '..');
const templatePath = path.join(currentDir, 'src', 'dashboard.html');
const cssPath = path.join(currentDir, 'src', 'dashboard.css');
const appPath = path.join(currentDir, 'src', 'dashboard.js');
const xlsxPath = path.join(workspaceRoot, 'public', 'vendor', 'xlsx.full.min.js');
const logoPath = path.join(process.env.USERPROFILE || workspaceRoot, 'Pictures', 'Battery Images', 'Logo_RGB_Bateriku+2025-23_logo_432x320-2510860063-removebg-preview.png');
const outputPath = path.join(currentDir, 'dist', 'Daily Report Dashboard - Enhanced.html');
const desktopOutputPath = path.join(process.env.USERPROFILE || workspaceRoot, 'Desktop', 'Daily Report Dashboard - Enhanced.html');

const template = fs.readFileSync(templatePath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const xlsx = fs.readFileSync(xlsxPath, 'utf8');
const logo = fs.readFileSync(logoPath).toString('base64');

const html = template
  .replace('/* INLINE_CSS */', () => css)
  .replace('/* INLINE_LOGO */', () => logo)
  .replace('/* INLINE_XLSX */', () => xlsx)
  .replace('/* INLINE_APP */', () => app.replace(/<\/script/gi, '<\\/script'));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, enhanceWorkspace(html), 'utf8');
if (process.env.SKIP_DESKTOP_COPY !== '1') fs.copyFileSync(outputPath, desktopOutputPath);

console.log(`Created ${outputPath}`);
if (process.env.SKIP_DESKTOP_COPY !== '1') console.log(`Copied ${desktopOutputPath}`);
console.log(`Size: ${fs.statSync(outputPath).size} bytes`);
