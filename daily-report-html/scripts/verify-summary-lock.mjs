import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboardFiles = ['dashboard.js', 'dashboard.css', 'dashboard.html'];
const sourceDir = path.join(root, 'src');
const baselineDir = path.join(root, 'artifacts', 'upgrade-baseline');

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function occurrences(text, fragment) {
  return text.split(fragment).length - 1;
}

function verifyBaseline() {
  const hashes = new Map();
  for (const name of dashboardFiles) {
    const source = path.join(sourceDir, name);
    const baseline = path.join(baselineDir, name);
    assert.ok(existsSync(source), `Missing dashboard source: ${source}`);
    assert.ok(existsSync(baseline), `Missing upgrade baseline: ${baseline}`);
    const sourceHash = sha256(source);
    const baselineHash = sha256(baseline);
    assert.equal(sourceHash, baselineHash, `${name} does not exactly match artifacts/upgrade-baseline/${name}`);
    hashes.set(name, sourceHash);
  }
  return hashes;
}

function assertSourcesUnchanged(before) {
  for (const [name, hash] of before) {
    assert.equal(sha256(path.join(sourceDir, name)), hash, `${name} changed while Cloudflare assets were built`);
  }
}

function verifyPublicDashboard() {
  const html = readFileSync(path.join(root, 'cloudflare', 'public', 'index.html'), 'utf8');
  const dashboardCss = readFileSync(path.join(sourceDir, 'dashboard.css'), 'utf8');
  const dashboardApp = readFileSync(path.join(sourceDir, 'dashboard.js'), 'utf8');
  const workspaceCss = readFileSync(path.join(sourceDir, 'workspace-enhancements.css'), 'utf8');
  const workspaceApp = readFileSync(path.join(root, 'vendor', 'workspace-icons.js'), 'utf8')
    + '\n' + readFileSync(path.join(sourceDir, 'workspace-enhancements.js'), 'utf8');
  const buildId = createHash('sha256')
    .update(readFileSync(path.join(sourceDir, 'dashboard.html'), 'utf8'))
    .update(dashboardCss)
    .update(dashboardApp)
    .update(workspaceCss)
    .update(workspaceApp)
    .digest('hex')
    .slice(0, 12);

  const workspaceStyle = `<style data-workspace-enhancements>${workspaceCss}</style>`;
  // Inline script text must escape a literal closing script tag from the
  // unchanged dashboard source, otherwise HTML parsing ends the script early.
  const escapedDashboardApp = dashboardApp.replace(/<\/script/gi, '<\\/script');
  const workspaceScript = `<script>${workspaceApp.replace(/<\/script/gi, '<\\/script')}</script>`;
  assert.equal(occurrences(html, workspaceStyle), 1, 'Workspace CSS must be injected exactly once');
  assert.equal(occurrences(html, workspaceScript), 1, 'Workspace JavaScript must be injected exactly once');
  assert.ok(workspaceCss.includes('.ops-enhanced'), 'Workspace CSS must retain its opt-in .ops-enhanced scope');

  const styleEnd = html.indexOf(workspaceStyle) + workspaceStyle.length;
  const scriptEnd = html.indexOf(workspaceScript) + workspaceScript.length;
  assert.equal(html.slice(styleEnd, styleEnd + '\n</head>'.length), '\n</head>', 'Workspace CSS must be appended immediately before </head>');
  assert.equal(html.slice(scriptEnd, scriptEnd + '\n</body>'.length), '\n</body>', 'Workspace JavaScript must be appended immediately before </body>');
  assert.equal(scriptEnd, html.lastIndexOf('</body>') - 1, 'Workspace JavaScript must be appended before the document closing </body>, not text inside an inline script');
  assert.equal(occurrences(html, `<style>${dashboardCss}</style>`), 1, 'Public dashboard must include the locked dashboard CSS once');
  assert.equal(occurrences(html, `window.__DASHBOARD_BUILD_ID__ = ${JSON.stringify(buildId)};\n${escapedDashboardApp}`), 1, 'Public dashboard must include the locked dashboard application once');
}

function verifyOperationsPage() {
  const operationsPage = path.join(root, 'cloudflare', 'public', 'upload', 'operations', 'index.html');
  assert.ok(existsSync(operationsPage), 'Expected /upload/operations/index.html after the Cloudflare build');
  assert.ok(statSync(operationsPage).isFile(), '/upload/operations/index.html must be a file');
  assert.doesNotMatch(readFileSync(operationsPage, 'utf8'), /\bSummary\b/, '/upload/operations/index.html must not reference the Summary dashboard');
}

const initialHashes = verifyBaseline();
console.log('[verify-summary-lock] Locked dashboard sources match artifacts/upgrade-baseline.');

const build = spawnSync(process.execPath, ['build-cloudflare.mjs'], { cwd: root, stdio: 'inherit' });
try {
  assert.equal(build.status, 0, `Cloudflare asset build failed${build.error ? `: ${build.error.message}` : ''}`);
  assertSourcesUnchanged(initialHashes);
  verifyBaseline();
  verifyOperationsPage();
  console.log('[verify-summary-lock] /upload/operations/ exists and has no Summary dashboard reference.');
  verifyPublicDashboard();
} finally {
  assertSourcesUnchanged(initialHashes);
}

console.log('[verify-summary-lock] Cloudflare build preserved the locked sources, injected workspace enhancements once at the document boundaries, and produced a Summary-free /upload/operations/ page.');
