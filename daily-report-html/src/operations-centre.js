(function() {
  'use strict';
  var state = { data: null, tab: 'health', busy: false };
  var $ = function(id) { return document.getElementById(id); };
  var escape = function(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function(value) { return Number.isFinite(Number(value)) && value != null ? Number(value).toLocaleString('en-MY') : '-'; };
  var date = function(value) { var d = new Date(value); return value && !isNaN(d) ? new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(d) : 'Not recorded'; };
  var titles = { health: 'System health', verify: 'Grafana verification', master: 'Master review', jobs: 'Sync jobs', backups: 'Backups' };
  var statuses = { ok: 'Healthy', empty: 'No records', error: 'Check failed', unknown: 'Not checked', unconfigured: 'Not configured', failed: 'Failed', completed: 'Completed', running: 'Running', queued: 'Queued', pending: 'Pending' };
  function pill(value) { var safe = statuses[value] ? value : 'unknown'; return '<span class="pill ' + safe + '">' + statuses[safe] + '</span>'; }
  function icons() { document.querySelectorAll('[data-icon]').forEach(function(node) { if (!node.querySelector('svg') && window.reportIcon) node.insertAdjacentHTML('afterbegin', window.reportIcon(node.dataset.icon)); }); }
  function alert(message, error, auth) {
    $('pageAlert').hidden = !message;
    $('pageAlert').classList.toggle('error', !!error);
    $('pageAlert').textContent = message || '';
    if (auth) $('pageAlert').insertAdjacentHTML('beforeend', ' <a href="/upload/?next=%2Fupload%2Foperations%2F">Sign in to data management</a>');
  }
  async function api(path, body) {
    var response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    var json = await response.json().catch(function() { return {}; });
    if (!response.ok || response.redirected) {
      var error = new Error(json.error || (response.status === 401 || response.status === 403 || response.redirected ? 'Your admin session has expired. Sign in again.' : 'Request failed (HTTP ' + response.status + ').'));
      error.auth = [401, 403].includes(response.status) || response.redirected;
      throw error;
    }
    return json;
  }
  async function action(button, task) {
    if (state.busy) return;
    state.busy = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    alert('');
    try { await task(); } catch (error) { alert(error.message, true, error.auth); }
    finally { state.busy = false; button.disabled = false; button.removeAttribute('aria-busy'); }
  }
  function metric(label, value, note, tone) { return '<article class="metric ' + (tone || '') + '"><span>' + escape(label) + '</span><strong>' + escape(value) + '</strong><small>' + escape(note) + '</small></article>'; }
  function definition(label, value) { return '<div class="definition"><span>' + escape(label) + '</span><strong>' + escape(value) + '</strong></div>'; }
  function render() {
    var data = state.data || {}, health = data.health || {}, sources = health.sources || [], jobs = data.jobs || [], backups = data.backups || {};
    var attention = sources.filter(function(s) { return s.status === 'error' || s.status === 'unconfigured'; }).map(function(s) { return { title: s.label, text: s.error || 'Check the source configuration.' }; });
    jobs.filter(function(job) { return job.status === 'failed'; }).forEach(function(job) { attention.push({ title: job.sourceName || 'Archive sync', text: job.error || 'A batch failed. Review the job before resuming.' }); });
    if (health.b2wSync && health.b2wSync.error) attention.push({ title: 'Background B2W sync', text: health.b2wSync.error });
    if (backups.lastError) attention.push({ title: 'Scheduled backups', text: backups.lastError });
    var healthy = sources.filter(function(s) { return s.status === 'ok'; }).length;
    var unchecked = sources.filter(function(s) { return !s.status || s.status === 'unknown'; }).length;
    $('pageMeta').textContent = data.generatedAt ? 'Status loaded ' + date(data.generatedAt) + ' (MYT)' : 'Operations status is not available.';
    $('healthMetrics').innerHTML = metric('Healthy sources', healthy + ' / ' + sources.length, unchecked ? unchecked + ' not checked' : 'Last recorded checks') + metric('Needs attention', attention.length, 'Errors and configuration issues', attention.length ? 'attention' : '') + metric('Sync jobs', jobs.filter(function(j) { return ['running', 'queued'].includes(j.status); }).length, 'Running or queued') + metric('Available backups', (backups.items || []).length, 'Manual collections');
    $('sourcesBody').innerHTML = sources.length ? sources.map(function(source) {
      return '<tr><td class="source-name"><strong>' + escape(source.label) + '</strong><small>' + escape(source.id) + '</small></td><td>' + pill(source.status) + '</td><td>' + escape(date(source.lastSuccessAt)) + '</td><td class="numeric">' + num(source.recordCount) + '</td><td class="numeric">' + (source.latencyMs == null ? '-' : num(source.latencyMs) + ' ms') + '</td><td><details><summary>Inspect</summary><p>' + escape(source.error || (source.from ? source.from + ' to ' + source.to : 'No diagnostic check recorded.')) + '</p><p>Checked: ' + escape(date(source.generatedAt)) + '</p></details></td></tr>';
    }).join('') : '<tr><td colspan="6">No source health records. Run checks to collect a result.</td></tr>';
    $('attentionCount').textContent = attention.length + ' items';
    $('attentionList').innerHTML = attention.length ? attention.map(function(a) { return '<div class="attention-item"><strong>' + escape(a.title) + '</strong><p>' + escape(a.text) + '</p></div>'; }).join('') : '<p class="muted">No recorded failures.' + (unchecked ? ' Some sources have not been checked yet.' : ' Review timestamps before reporting.') + '</p>';
    var sync = health.b2wSync || {};
    $('b2wStatus').innerHTML = definition('Status', sync.status || 'Not recorded') + definition('Last success', date(sync.lastSuccessAt)) + definition('Last failure', date(sync.lastErrorAt)) + (sync.error ? definition('Error', sync.error) : '');
    $('jobsList').innerHTML = jobs.length ? jobs.map(function(job) {
      var progress = (job.completedMonths || 0) + ' of ' + job.totalMonths + ' months';
      return '<article class="job"><div class="job-heading"><div><strong>' + escape(job.sourceName || 'Historical archive') + '</strong><small>' + escape(date(job.createdAt)) + ' | ' + escape(job.id) + '</small></div><div class="job-actions">' + pill(job.status) + (job.status === 'failed' ? '<button class="button" data-resume="' + escape(job.id) + '" data-icon="RefreshCw">Resume</button>' : '') + '</div></div><span class="muted">' + escape(progress) + ' | ' + num(job.completedRows || 0) + ' of ' + num(job.totalRows) + ' rows published</span><progress value="' + Number(job.completedMonths || 0) + '" max="' + Number(job.totalMonths || 1) + '" aria-label="' + escape(progress) + '"></progress>' + (job.error ? '<p class="alert error">' + escape(job.error) + '</p>' : '') + '<details><summary>Batch history</summary><div class="table-wrap"><table><thead><tr><th>Month</th><th>Status</th><th class="numeric">Rows</th><th class="numeric">Attempts</th><th>Error</th></tr></thead><tbody>' + (job.months || []).map(function(m) { return '<tr><td>' + escape(m.month) + '</td><td>' + pill(m.status) + '</td><td class="numeric">' + num(m.rowCount) + '</td><td class="numeric">' + num(m.attempts) + '</td><td>' + escape(m.error || '-') + '</td></tr>'; }).join('') + '</tbody></table></div></details></article>';
    }).join('') : '<div class="empty">No saved sync jobs. Imports started in the upload centre appear here.</div>';
    $('retentionMeta').textContent = 'Retention: ' + (backups.retentionDays == null ? 'not available' : backups.retentionDays + ' days') + (backups.maxPerKind ? ', up to ' + backups.maxPerKind + ' per collection.' : '.') + ' Last scheduled backup: ' + date(backups.lastScheduledAt) + '.';
    $('backupsBody').innerHTML = (backups.items || []).length ? backups.items.map(function(b) { return '<tr><td><strong>' + escape(b.kind.toUpperCase()) + '</strong></td><td>' + escape(date(b.createdAt)) + '</td><td>' + escape(b.trigger) + '</td><td class="numeric">' + num(b.recordCount) + '</td><td class="numeric">' + num(Math.ceil((b.bytes || 0) / 1024)) + ' KB</td><td><button class="button" data-backup="' + escape(b.id) + '" data-icon="Download">Download</button></td></tr>'; }).join('') : '<tr><td colspan="6">No backups recorded yet.</td></tr>';
    icons();
  }
  async function refresh() { state.data = await api('/api/operations'); render(); }
  function switchTab() {
    state.tab = titles[location.hash.slice(1)] ? location.hash.slice(1) : 'health';
    $('pageTitle').textContent = titles[state.tab];
    Object.keys(titles).forEach(function(tab) { $(tab + 'Panel').hidden = tab !== state.tab; });
    document.querySelectorAll('[data-tab]').forEach(function(link) { link.classList.toggle('active', link.dataset.tab === state.tab); if (link.dataset.tab === state.tab) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  }
  function confirmAction(title, message, label) {
    return new Promise(function(resolve) {
      $('confirmTitle').textContent = title; $('confirmMessage').textContent = message; $('confirmAccept').textContent = label;
      var dialog = $('confirmDialog'); dialog.returnValue = ''; dialog.addEventListener('close', function() { resolve(dialog.returnValue === 'confirm'); }, { once: true }); dialog.showModal();
    });
  }
  async function verify() {
    var from = $('verifyFrom').value, to = $('verifyTo').value;
    var days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
    if (!Number.isFinite(days) || days < 1 || days > 14) throw new Error('Choose a valid range of 1 to 14 days.');
    $('verifyResult').className = '';
    $('verifyResult').textContent = 'Checking the selected Grafana range...';
    try {
      var check = await api('/api/operations/check', { from: from, to: to });
      var query = '?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
      var performance = await api('/api/pitstop-performance' + query);
      var totals = performance.channelTotals || {}, rows = performance.pitstops || [];
      var actual = { hq: 0, bp: 0 }, invalid = 0;
      rows.forEach(function(row) { var channel = String(row.channel || '').toLowerCase(), value = Number(row.sales); if (!['hq', 'bp'].includes(channel) || !Number.isFinite(value)) { invalid++; return; } actual[channel] += value; });
      var ready = ['hq', 'bp'].every(function(key) { return Number.isFinite(totals[key]); });
      var matches = ready && !invalid && actual.hq === totals.hq && actual.bp === totals.bp;
      $('verifyResult').innerHTML = '<div class="section-heading"><div><h2>' + (matches ? 'HQ/BP panel totals agree with returned rows' : 'Panel reconciliation needs review') + '</h2><span class="muted">' + escape(from + ' to ' + to) + ' | ' + num(days) + ' calendar days</span></div>' + pill(matches ? 'ok' : 'error') + '</div><div class="table-wrap"><table><thead><tr><th>Metric</th><th class="numeric">HQ units</th><th class="numeric">BP units</th><th class="numeric">Difference</th></tr></thead><tbody>' + ['hq', 'bp'].map(function(key) { return '<tr><td>' + key.toUpperCase() + ': panel / returned rows</td><td class="numeric">' + num(totals[key]) + '</td><td class="numeric">' + num(actual[key]) + '</td><td class="numeric">' + (ready ? num(actual[key] - totals[key]) : '-') + '</td></tr>'; }).join('') + '</tbody></table></div><p class="muted">This checks the HQ/BP API payload, not the separate Order - Daily metric or dashboard Master mapping. No totals or Master records are changed.</p><h3 class="result-heading">Source checks</h3>' + (check.sources || []).map(function(source) { return '<div class="definition"><span>' + escape(source.label) + '</span><strong>' + pill(source.status) + (source.error ? ' ' + escape(source.error) : ' ' + num(source.recordCount) + ' records') + '</strong></div>'; }).join('');
      // Headers describe the two independent sides rather than suggesting HQ vs BP.
      var ths = $('verifyResult').querySelectorAll('thead th'); ths[1].textContent = 'Panel total'; ths[2].textContent = 'Sum of rows';
      await refresh();
    } catch (error) { $('verifyResult').className = 'empty'; $('verifyResult').textContent = 'Verification failed. No matching result is available for this range.'; throw error; }
  }
  async function reviewMaster(file) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) throw new Error('Choose a Master file smaller than 12 MB.');
    $('masterResult').textContent = 'Reading ' + file.name + '...';
    var rows;
    if (/\.json$/i.test(file.name)) { var parsed = JSON.parse(await file.text()); rows = Array.isArray(parsed) ? parsed : parsed.pitstopMaster || (parsed.data && parsed.data.pitstopMaster); }
    else {
      var book = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
      var name = book.SheetNames.find(function(n) { return /^(pitstop[ _]?master|master pitstop)$/i.test(n); }) || book.SheetNames[0];
      rows = window.XLSX.utils.sheet_to_json(book.Sheets[name], { defval: '', raw: true });
    }
    if (!Array.isArray(rows) || !rows.length) throw new Error('The selected file has no Pitstop Master rows.');
    var current = await api('/api/data'), payload = current.data || current;
    if (!window.MasterReview) throw new Error('Master review module is unavailable.');
    var result = window.MasterReview.review(payload.pitstopMaster || [], rows);
    $('masterResult').className = '';
    $('masterResult').innerHTML = '<h3 class="result-heading">' + escape(file.name) + '</h3>' + renderReview(result);
  }
  function renderReview(result) {
    // Adapted from the same review result used by the publish preflight.
    var counts = result.counts || {};
    function fieldRows(items, type) {
      return items.slice(0, 50).map(function(item) {
        if (type === 'changed') return item.fields.map(function(field) { return '<div class="review-item"><strong>' + escape(item.branch) + '</strong> | ' + escape(field.field) + ': <code>' + escape(field.current || '(empty)') + '</code> to <code>' + escape(field.candidate || '(empty)') + '</code></div>'; }).join('');
        return '<div class="review-item"><strong>' + escape(item.branch || '(missing Branch)') + '</strong> | row ' + escape(item.row || '-') + '</div>';
      }).join('');
    }
    var issues = [].concat(result.duplicates || [], result.missingFields || [], result.warnings || []);
    var issueHtml = issues.slice(0, 80).map(function(item) { return '<div class="review-item"><strong>' + escape(item.branch || 'Master') + '</strong> | ' + escape(item.message) + '</div>'; }).join('');
    return '<div class="review-counts">' + Object.keys(counts).map(function(key) { return '<span><strong>' + num(counts[key]) + '</strong> ' + escape(key) + '</span>'; }).join('') + '</div>' + (issues.length ? '<h3 class="result-heading">Validation notes</h3>' + issueHtml : '<p class="muted">No validation issues found.</p>') + '<h3 class="result-heading">Changes to review</h3>' + '<div class="review-item"><strong>Added:</strong> ' + num((result.added || []).length) + '</div>' + fieldRows(result.added || [], 'added') + '<div class="review-item"><strong>Removed:</strong> ' + num((result.removed || []).length) + '</div>' + fieldRows(result.removed || [], 'removed') + '<div class="review-item"><strong>Changed:</strong> ' + num((result.changed || []).length) + '</div>' + fieldRows(result.changed || [], 'changed') + '<p class="muted">This screen does not publish anything. Use the upload centre to review the full values and explicitly save the Master.</p>';
  }
  $('refreshStatus').addEventListener('click', function() { action(this, refresh); });
  $('runChecks').addEventListener('click', function() { action(this, async function() { var result = await api('/api/operations/check', {}); await refresh(); alert('Checks completed for ' + result.from + ' to ' + result.to + '.'); }); });
  $('verifyForm').addEventListener('submit', function(event) { event.preventDefault(); action(this.querySelector('button'), verify); });
  $('masterFile').addEventListener('change', function() { var file = this.files[0]; action(this, async function() { try { await reviewMaster(file); } catch (e) { $('masterResult').textContent = 'The proposed Master could not be reviewed.'; throw e; } }); });
  $('createBackup').addEventListener('click', function() { action(this, async function() { var kind = $('backupKind').value; if (!await confirmAction('Create a recovery backup?', 'A new copy of ' + (kind === 'all' ? 'all four manual collections' : kind.toUpperCase()) + ' will be stored. Existing records will not be changed.', 'Create backup')) return; var result = await api('/api/operations/backups', kind === 'all' ? {} : { kind: kind }); await refresh(); alert(result.backups.length + ' backup(s) created.'); }); });
  document.addEventListener('click', function(event) {
    var resume = event.target.closest('[data-resume]'), backup = event.target.closest('[data-backup]');
    if (resume) action(resume, async function() { if (!await confirmAction('Resume this sync job?', 'The server will retry unfinished months. Completed months remain checkpointed. Review the recorded error first.', 'Resume job')) return; await api('/api/operations/jobs/' + encodeURIComponent(resume.dataset.resume) + '/resume', {}); await refresh(); alert('Sync job resumed.'); });
    if (backup) action(backup, async function() { var data = await api('/api/operations/backups/' + encodeURIComponent(backup.dataset.backup)); var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'manual-backup-' + backup.dataset.backup + '.json'; a.click(); setTimeout(function() { URL.revokeObjectURL(url); }, 1000); });
  });
  var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  var yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  $('verifyFrom').value = yesterday; $('verifyTo').value = yesterday;
  addEventListener('hashchange', switchTab); switchTab(); icons();
  action($('refreshStatus'), refresh);
  setInterval(function() { if (document.hidden) return; api('/api/concurrency/heartbeat', {}).catch(function(error) { if (error.auth) alert(error.message, true, true); }); }, 45000);
  setInterval(function() { if (!document.hidden && state.tab === 'jobs' && !state.busy && state.data && (state.data.jobs || []).some(function(job) { return ['queued', 'running'].includes(job.status); })) action($('refreshStatus'), refresh); }, 10000);
})();
