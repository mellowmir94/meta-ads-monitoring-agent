(function() {
  'use strict';

  var EXPECTED_SHEETS = ['Pitstop Master'];
  var REQUIRED_SHEETS = ['Pitstop Master'];
  var SHEET_ALIASES = { BGarage: ['BGarage', 'BGarange', 'B Garage', 'B Garange', 'Garage'], Indonesia: ['Indonesia', 'Bateriku Indonesia', 'Indonesia Sales'], 'Pitstop Master': ['Pitstop Master', 'Pitstop_Master', 'PitstopMaster', 'Master Pitstop'], 'Pitstop Relocations': ['Pitstop Relocations', 'Pitstop Relocation', 'Relocations', 'Relocation'] };
  var DASHBOARD_WORKBOOK_KEY = 'daily-report-dashboard-workbook';
  var HOSTED_MODE = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  var state = { workbook: window.__INITIAL_WORKBOOK__ || { sourceFile: 'No Pitstop Master loaded', loadedAt: '', sheets: {} }, activeSheet: 'Pitstop Master', query: '' };
  var numberFormatter = new Intl.NumberFormat('en-MY', { maximumFractionDigits: 0 });

  function escapeHtml(value) { return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function(character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }
  function formatNumber(value) { return numberFormatter.format(Number(value || 0)); }
  function cleanValue(value, key) {
    if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && /date|day|tanggal|tarikh/i.test(String(key || ''))) return new Date(Date.UTC(1899, 11, 30 + value)).toISOString().slice(0, 10);
    return String(value === undefined || value === null ? '' : value);
  }
  function formatDateLabel(value) {
    var raw = cleanValue(value, 'Date'), iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/), slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    if (slash) return slash[1].padStart(2, '0') + '/' + slash[2].padStart(2, '0') + '/' + slash[3];
    return raw;
  }
  function previousCalendarMonth() {
    var now = new Date(), previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return previous.getFullYear() + '-' + String(previous.getMonth() + 1).padStart(2, '0');
  }
  function formatMonthLabel(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return String(value || '');
    return new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric' }).format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
  }
  function rowsFor(sheetName) { var sheet = state.workbook.sheets && state.workbook.sheets[sheetName]; return sheet && Array.isArray(sheet.rows) ? sheet.rows : []; }
  function dashboardWorkbookPayload(workbook) {
    workbook = workbook || state.workbook;
    function sheetRows(name) { return workbook.sheets && workbook.sheets[name] ? workbook.sheets[name].rows : []; }
    var payload = {
      pitstopMaster: sheetRows('Pitstop Master'),
      pitstopRelocations: sheetRows('Pitstop Relocations'),
      sourceName: 'Pitstop Master: ' + (workbook.pitstopMasterSourceFile || workbook.sourceFile || 'workbook'),
      generatedAt: new Date().toISOString(),
      uploadedAt: Date.now()
    };
    payload.pitstopMasterSourceName = workbook.pitstopMasterSourceFile || '';
    payload.pitstopMasterUploadedAt = workbook.pitstopMasterLoadedAt || '';
    return payload;
  }
  function saveDashboardWorkbook() {
    var payload = dashboardWorkbookPayload();
    try { localStorage.setItem(DASHBOARD_WORKBOOK_KEY, JSON.stringify(payload)); } catch (error) { /* file:// storage may be disabled */ }
  }
  async function saveHostedWorkbook(workbook, etag) {
    if (!HOSTED_MODE) return null;
    var headers = { 'content-type': 'application/json' };
    if (etag) headers['If-Match'] = etag;
    var response = await fetch('/api/data', { method: 'PUT', credentials: 'same-origin', headers: headers, body: JSON.stringify(dashboardWorkbookPayload(workbook)) });
    var result = await response.json().catch(function() { return {}; });
    if (!response.ok) throw new Error(result.error || ('Cloud upload failed (HTTP ' + response.status + ').'));
    return result;
  }
  async function latestMaster() {
    var workbook = state.workbook, etag = '';
    if (HOSTED_MODE) {
      var response = await fetch('/api/data', { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 404) workbook = { sheets: {}, sourceFile: 'No Pitstop Master loaded' };
      else {
        if (!response.ok) throw new Error('Could not verify the latest Pitstop Master (HTTP ' + response.status + '). Retry before confirming.');
        var stored = await response.json(), payload = stored && (stored.data || stored);
        if (!payload || typeof payload !== 'object' || (payload.pitstopMaster !== undefined && !Array.isArray(payload.pitstopMaster))) throw new Error('The latest Master response is invalid. Retry before confirming.');
        workbook = workbookStateFromStored(stored);
        etag = response.headers.get('etag') || '';
      }
    }
    var rows = workbook.sheets && workbook.sheets['Pitstop Master'] ? workbook.sheets['Pitstop Master'].rows : [];
    return { workbook: workbook, rows: rows, etag: etag, fingerprint: JSON.stringify([rows, workbook.pitstopMasterSourceFile || '', workbook.pitstopMasterLoadedAt || '']) };
  }
  function workbookStateFromStored(stored) {
    var payload = stored && stored.data ? stored.data : stored;
    if (!payload || typeof payload !== 'object') return null;
    var sheets = {};
    [['Pitstop Master', 'pitstopMaster'], ['Pitstop Relocations', 'pitstopRelocations']].forEach(function(pair) {
      if (Array.isArray(payload[pair[1]])) sheets[pair[0]] = { rows: payload[pair[1]] };
    });
    return { sourceFile: String(payload.sourceName || (stored.meta && stored.meta.sourceName) || 'Cloudflare master workbook').replace(/^Uploaded:\s*/i, ''), loadedAt: stored.meta && stored.meta.uploadedAt ? formatDateLabel(stored.meta.uploadedAt.slice(0, 10)) : 'Cloud copy', pitstopMasterSourceFile: String(payload.pitstopMasterSourceName || ''), pitstopMasterLoadedAt: String(payload.pitstopMasterUploadedAt || ''), sheets: sheets };
  }
  async function loadHostedWorkbook() {
    if (!HOSTED_MODE) return;
    try {
      var response = await fetch('/api/data', { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 404) return;
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var workbookState = workbookStateFromStored(await response.json());
      if (!workbookState) return;
      state.workbook = workbookState;
      state.activeSheet = EXPECTED_SHEETS.find(function(name) { return !!workbookState.sheets[name]; }) || 'Pitstop Master';
      renderTabs(); renderPreview(); updateStatus('Loaded', false);
    } catch (error) {
      setMessage(error.message.indexOf('401') !== -1 ? 'Sign in to manage the cloud workbook.' : 'The cloud workbook could not be loaded.', true);
    }
  }
  function openDashboardWithUpload() {
    if (HOSTED_MODE) { window.location.href = '/'; return; }
    var target = window.open('Daily Report Dashboard - Enhanced.html', '_blank');
    if (!target) { setMessage('Allow pop-ups to open the dashboard with this upload.', true); return; }
    var payload = dashboardWorkbookPayload(), started = Date.now(), timer = window.setInterval(function() {
      if (Date.now() - started > 10000) { window.clearInterval(timer); return; }
      try { target.postMessage({ type: 'daily-report-dashboard-workbook', payload: payload }, '*'); } catch (error) { /* target may still be loading */ }
    }, 150);
    try { target.focus(); } catch (error) { /* focus may be blocked by the browser */ }
  }
  function columnsFor(rows) { var keys = [], seen = {}; rows.slice(0, 50).forEach(function(row) { Object.keys(row || {}).forEach(function(key) { if (!seen[key]) { seen[key] = true; keys.push(key); } }); }); return keys; }
  function cleanKey(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function rowValue(row, aliases) { var keys = Object.keys(row || {}), wanted = aliases.map(cleanKey); for (var index = 0; index < keys.length; index += 1) { if (wanted.indexOf(cleanKey(keys[index])) !== -1) return row[keys[index]]; } return '';
  }
  function isActiveMasterRow(row) { return String(rowValue(row, ['branch_status', 'branch status', 'status']) || '').trim().toLowerCase() === 'active'; }
  function isMalaysiaMasterRow(row) { var country = String(rowValue(row, ['country']) || '').trim().toUpperCase(); return country === 'MY' || country === 'MALAYSIA'; }
  function dateValues() {
    var values = [];
    EXPECTED_SHEETS.forEach(function(name) {
      rowsFor(name).forEach(function(row) {
        var value = cleanValue(row.Date || row.date || row.Day || row.day, 'Date');
        if (value) values.push(value);
      });
    });
    values.sort();
    return { first: values[0] || '', last: values[values.length - 1] || '' };
  }

  function setMessage(message, isError) { var element = document.getElementById('message'); element.textContent = message || ''; element.hidden = !message; element.classList.toggle('is-error', !!isError); }
  function showToast(message) { var toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('is-visible'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(function() { toast.classList.remove('is-visible'); }, 3000); }
  function setUploadStep(active) { ['select', 'review', 'confirm'].forEach(function(step) { var element = document.getElementById('step' + step.charAt(0).toUpperCase() + step.slice(1)); if (element) element.classList.toggle('is-current', step === active); }); }

  function updateStatus(status, isError) {
    var sheets = state.workbook.sheets || {}, master = rowsFor('Pitstop Master'), activeMaster = master.filter(function(row) { return isActiveMasterRow(row) && isMalaysiaMasterRow(row); });
    var missing = REQUIRED_SHEETS.filter(function(name) { return !sheets[name]; });
    var badge = document.getElementById('statusBadge'); badge.textContent = isError ? 'Check file' : missing.length ? 'Incomplete' : status || 'Ready'; badge.className = 'status-badge' + (isError || missing.length ? ' error' : state.workbook.sourceFile === 'Built-in reference dataset' ? ' preview' : '');
    document.getElementById('sourceName').textContent = state.workbook.sourceFile || 'No workbook loaded';
    document.getElementById('statusGrid').innerHTML = '<div class="status-metric"><span>Master rows</span><strong>' + formatNumber(master.length) + '</strong></div><div class="status-metric"><span>Active Malaysia</span><strong>' + formatNumber(activeMaster.length) + '</strong></div>';
    var foot = '';
    if (state.workbook.loadedAt) foot += ' · Loaded: ' + escapeHtml(state.workbook.loadedAt);
    if (missing.length) foot += ' · Missing: ' + missing.join(', ');
    foot = master.length ? 'Pitstop Master is ready for dashboard validation.' : 'No Pitstop Master rows found.';
    if (state.workbook.loadedAt) foot += ' - Loaded: ' + escapeHtml(state.workbook.loadedAt);
    if (missing.length) foot += ' - Missing: ' + missing.join(', ');
    document.getElementById('statusFoot').textContent = foot;
  }

  function renderTabs() {
    var tabs = document.getElementById('sheetTabs'), sheets = state.workbook.sheets || {};
    tabs.innerHTML = EXPECTED_SHEETS.map(function(name) { var exists = !!sheets[name], active = state.activeSheet === name; return '<button class="sheet-tab' + (active ? ' is-active' : '') + (!exists ? ' is-missing' : '') + '" type="button" role="tab" aria-selected="' + active + '" data-sheet="' + escapeHtml(name) + '">' + escapeHtml(name) + (exists ? ' · ' + formatNumber(rowsFor(name).length) : ' · missing') + '</button>'; }).join('');
    tabs.querySelectorAll('[data-sheet]').forEach(function(button) { button.addEventListener('click', function() { state.activeSheet = button.getAttribute('data-sheet'); renderTabs(); renderPreview(); }); });
  }

  function renderPreview() {
    var rows = rowsFor(state.activeSheet), query = state.query.toLowerCase().trim(), columns = columnsFor(rows), filtered = query ? rows.filter(function(row) { return columns.some(function(key) { return cleanValue(row[key], key).toLowerCase().indexOf(query) !== -1; }); }) : rows, visible = filtered.slice(0, 12), meta = document.getElementById('sheetMeta'), wrap = document.getElementById('previewWrap');
    meta.innerHTML = '<span><strong>' + escapeHtml(state.activeSheet) + '</strong> · ' + formatNumber(rows.length) + ' rows · ' + formatNumber(columns.length) + ' columns</span><span>' + (query ? 'Filtered to ' + formatNumber(filtered.length) : 'Showing first ' + formatNumber(Math.min(visible.length, 12))) + ' rows</span>';
    if (!rows.length) { wrap.innerHTML = '<div class="empty-state">This sheet is missing or contains no rows.</div>'; return; }
    if (!columns.length) { wrap.innerHTML = '<div class="empty-state">No columns found.</div>'; return; }
    var head = '<thead><tr>' + columns.map(function(key) { return '<th>' + escapeHtml(key) + '</th>'; }).join('') + '</tr></thead>';
    var body = visible.length ? '<tbody>' + visible.map(function(row) { return '<tr>' + columns.map(function(key) { var value = /date|day|tanggal|tarikh/i.test(String(key || '')) ? formatDateLabel(row[key]) : cleanValue(row[key], key); return '<td title="' + escapeHtml(value) + '">' + escapeHtml(value) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>' : '<tbody><tr><td colspan="' + columns.length + '"><div class="empty-state">No rows match your search.</div></td></tr></tbody>';
    wrap.innerHTML = '<table class="data-table">' + head + body + '</table>';
  }

  function workbookFromRows() {
    var xlsx = window.XLSX, workbook = xlsx.utils.book_new(), schemas = {
      'Service & Warranty': ['Date', 'RSA Jumpstart', 'RSA Tyre Patch', 'RSA Fuel', 'B2W', 'ResQ Selangor', 'ResQ JB', 'ResQ Pahang', 'ResQ Penang', 'Warranty 1st', 'Warranty 2nd', 'Warranty 3rd'],
      BGarage: ['Date', 'Outlet', 'Daily Sales Target RM', 'Daily Actual Sales RM', 'MTD Actual Sales RM', 'Monthly Target', 'Special Cases Referred', 'Successful Conversions', 'Pick & Drop Cases', 'Daily Intake Actual', 'Daily Intake Target'],
      Indonesia: ['Date', 'Pitstop', 'Total Lead', 'Pending Lead', 'Cancelled Lead', 'Bateriku Jumpstart', 'Bateriku Battery', 'Partner Jumpstart', 'Partner Battery'],
    };
    EXPECTED_SHEETS.forEach(function(name) { var row = {}; schemas[name].forEach(function(key) { row[key] = ''; }); xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([row]), name); });
    return workbook;
  }

  function parsePitstopMaster(workbook, sourceFile) {
    var aliases = SHEET_ALIASES['Pitstop Master'], sheetName = aliases.find(function(candidate) { return !!workbook.Sheets[candidate]; }) || workbook.SheetNames[0];
    if (!sheetName || !workbook.Sheets[sheetName]) throw new Error('No worksheet was found in this file.');
    var rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true });
    var relocationSheetName = ['Pitstop Relocations', 'Pitstop Relocation', 'Relocations', 'Relocation'].find(function(candidate) { return !!workbook.Sheets[candidate]; });
    return { rows: rows, hasRelocations: !!relocationSheetName, sourceFile: sourceFile, activeMalaysia: rows.filter(function(row) { return isActiveMasterRow(row) && isMalaysiaMasterRow(row); }).length, inactive: rows.filter(function(row) { return !isActiveMasterRow(row); }).length, missingTier: rows.filter(function(row) { return !String(rowValue(row, ['tier']) || '').trim(); }).length };
  }

  function historicalDateIso(value) {
    if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(Date.UTC(1899, 11, 30 + Math.floor(value))).toISOString().slice(0, 10);
    var raw = String(value || '').trim(), iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/), slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    if (slash) return slash[3] + '-' + slash[2].padStart(2, '0') + '-' + slash[1].padStart(2, '0');
    return '';
  }

  function historicalNumber(value) {
    var cleaned = String(value === undefined || value === null ? '' : value).replace(/,/g, '').trim();
    var number = Number(cleaned);
    return Number.isFinite(number) ? number : NaN;
  }

  function parseHistoricalArchive(workbook, sourceFile) {
    var sheetName = ['Archive Data', 'Historical Pitstop Sales', 'Pitstop History', 'History'].find(function(name) { return !!workbook.Sheets[name]; });
    if (!sheetName) throw new Error('Use the archive workbook containing the Archive Data sheet.');
    var sourceRows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true });
    var rows = [], invalid = 0, duplicates = [], seen = {};
    sourceRows.forEach(function(row) {
      var date = historicalDateIso(rowValue(row, ['date', 'report date']));
      var channel = String(rowValue(row, ['channel', 'type']) || '').trim().toUpperCase();
      var pitstop = String(rowValue(row, ['pitstop', 'branch', 'name']) || '').trim();
      var stateName = String(rowValue(row, ['state / hub', 'state', 'hub']) || '').trim();
      var sales = historicalNumber(rowValue(row, ['sales', 'total sales', 'orders']));
      if (!date && !pitstop && !channel) return;
      if (!date || ['HQ', 'BP'].indexOf(channel) === -1 || !pitstop || !Number.isFinite(sales) || sales < 0) { invalid += 1; return; }
      var key = date + '::' + channel + '::' + pitstop.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (seen[key]) duplicates.push(date + ' ' + channel + ' ' + pitstop);
      seen[key] = true;
      rows.push({ date: date, channel: channel, pitstop: pitstop, state: stateName, sales: sales });
    });
    if (invalid) throw new Error(formatNumber(invalid) + ' archive row(s) have an invalid Date, Channel, Pitstop or Sales value. Correct them before uploading.');
    if (!rows.length) throw new Error('No historical pitstop sales rows were found in Archive Data.');
    if (duplicates.length) throw new Error('Duplicate Date + Channel + Pitstop rows found: ' + duplicates.slice(0, 4).join(', ') + (duplicates.length > 4 ? '…' : '') + '.');
    rows.sort(function(left, right) { return left.date.localeCompare(right.date) || left.channel.localeCompare(right.channel) || left.pitstop.localeCompare(right.pitstop); });
    var months = {};
    rows.forEach(function(row) { var month = row.date.slice(0, 7); if (!months[month]) months[month] = []; months[month].push(row); });
    return { rows: rows, months: months, sourceFile: sourceFile, from: rows[0].date, to: rows[rows.length - 1].date, totalSales: rows.reduce(function(sum, row) { return sum + row.sales; }, 0) };
  }

  async function loadHistoricalManifest() {
    if (!HOSTED_MODE) return;
    try {
      var response = await fetch('/api/pitstop-history', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      var manifest = await response.json();
      var element = document.getElementById('historyMessage');
      if (element) {
        element.textContent = 'Current archive: ' + formatDateLabel(manifest.from) + ' to ' + formatDateLabel(manifest.to) + ' · ' + formatNumber(manifest.totalRows) + ' daily pitstop rows · ' + formatNumber(manifest.months.length) + ' monthly chunks.';
        element.hidden = false;
        element.classList.remove('is-error');
      }
    } catch (error) { /* an archive is optional */ }
  }

  async function loadSharePoint(stage) {
    var value = window.prompt('Paste a SharePoint Excel link that your browser can access.'); if (!value) return;
    try { var response = await fetch(value, { cache: 'no-store', credentials: 'include' }); if (!response.ok) throw new Error('HTTP ' + response.status); await stage(new File([await response.blob()], 'SharePoint.xlsx')); }
    catch (error) { setUploadStep('review'); setMessage('SharePoint could not return an Excel file. Use Upload Excel workbook instead.', true); updateStatus('Error', true); }
  }

  function initPinGate() {
    var gate = document.getElementById('pinGate');
    if (gate) gate.hidden = true;
  }

  var concurrencyHeartbeatTimer = 0;

  async function sendConcurrencyHeartbeat() {
    if (!HOSTED_MODE) return;
    try {
      var response = await fetch('/api/concurrency/heartbeat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        cache: 'no-store'
      });
      if (response.status === 401) {
        window.location.replace('/login?next=' + encodeURIComponent(window.location.pathname + window.location.search));
        return;
      }
      if (!response.ok) return;
      var result = await response.json();
      if (!result || result.status !== 'admitted') window.location.replace('/waiting-room?next=' + encodeURIComponent(window.location.pathname + window.location.search));
    } catch (_) {
      // Heartbeat expiry remains the authoritative fallback for disconnected tabs.
    }
  }

  function startConcurrencyHeartbeat() {
    if (!HOSTED_MODE || concurrencyHeartbeatTimer) return;
    sendConcurrencyHeartbeat();
    concurrencyHeartbeatTimer = window.setInterval(sendConcurrencyHeartbeat, 30000);
    document.addEventListener('visibilitychange', function() { if (!document.hidden) sendConcurrencyHeartbeat(); });
  }

  var ARCHIVE_JOB_STORAGE_KEY = 'daily-report-archive-job-v1';
  var archiveJobRecord = null, archiveJobTimer = 0, archiveJobBusy = false;
  function storedArchiveJob() {
    var records = [];
    ['localStorage', 'sessionStorage'].forEach(function(name) {
      try {
        var record = JSON.parse(window[name].getItem(ARCHIVE_JOB_STORAGE_KEY) || 'null');
        if (record && typeof record.key === 'string' && (!record.id || /^[a-zA-Z0-9-]{1,80}$/.test(record.id))) records.push(record);
      } catch (_) { /* Storage can be disabled in private or file mode. */ }
    });
    return records.sort(function(a, b) { return Number(b.updatedAt || 0) - Number(a.updatedAt || 0); })[0] || null;
  }
  function persistArchiveJob(record) {
    archiveJobRecord = record;
    record.updatedAt = Date.now();
    var saved = false;
    ['localStorage', 'sessionStorage'].forEach(function(name) {
      try { window[name].setItem(ARCHIVE_JOB_STORAGE_KEY, JSON.stringify(record)); saved = true; } catch (_) { /* The in-memory job remains usable. */ }
    });
    return saved;
  }
  function archiveJobMessage(message, error) {
    var element = document.getElementById('archiveJobMessage');
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
    element.classList.toggle('is-error', !!error);
  }
  function renderArchiveJob(job) {
    var panel = document.getElementById('archiveJobPanel');
    if (!panel) return;
    panel.hidden = false;
    document.getElementById('archiveJobIdentity').textContent = (archiveJobRecord.sourceName || 'Archive') + (job ? ' | Job ' + job.id : ' | Submission awaiting confirmation');
    document.getElementById('archiveJobStatus').textContent = job ? job.status + ': ' + job.completedMonths + ' of ' + job.totalMonths + ' months saved.' : archiveJobRecord.status === 'unavailable' ? 'Durable operations is unavailable. Retry the job service or explicitly choose legacy month upload.' : archiveJobRecord.status === 'completed' ? 'Legacy archive upload completed.' : 'The submission result is unknown. Select the same archive file and confirm to recover it with the same request key.';
    var progress = document.getElementById('archiveJobProgress');
    progress.max = job ? Math.max(1, Number(job.totalMonths)) : 1;
    progress.value = job ? Number(job.completedMonths) : 0;
    document.getElementById('archiveJobMonths').innerHTML = job ? job.months.map(function(month) { return '<li><strong>' + escapeHtml(month.month) + '</strong>: ' + escapeHtml(month.status || 'pending') + (month.error ? ' - ' + escapeHtml(month.error) : '') + '</li>'; }).join('') : '';
    document.getElementById('archiveJobResume').hidden = !job || job.status === 'completed';
    document.getElementById('archiveJobResume').disabled = archiveJobBusy;
    document.getElementById('archiveJobRefresh').disabled = archiveJobBusy || !archiveJobRecord.id;
  }
  async function archiveJobRequest(url, method, body, key) {
    var headers = { accept: 'application/json' };
    if (body) headers['content-type'] = 'application/json';
    if (key) headers['Idempotency-Key'] = key;
    var response = await fetch(url, { method: method, credentials: 'same-origin', cache: 'no-store', headers: headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    var result = await response.json().catch(function() { return {}; });
    if (!response.ok) {
      var error = new Error(result.error || ('Archive job request failed (HTTP ' + response.status + ').'));
      error.code = response.status === 503 && result.code === 'operations_unavailable' ? 'operations_unavailable' : (result.code || 'job_request_failed');
      error.status = response.status;
      throw error;
    }
    var job = result.job;
    if (!job || !/^[a-zA-Z0-9-]{1,80}$/.test(job.id) || !['queued', 'running', 'failed', 'completed', 'paused'].includes(job.status) || !Array.isArray(job.months) || !Number.isInteger(job.completedMonths) || !Number.isInteger(job.totalMonths) || job.totalMonths < 1 || job.completedMonths < 0 || job.completedMonths > job.totalMonths) throw new Error('The archive job response is invalid. Check archive operations before retrying.');
    return job;
  }
  function acceptArchiveJob(job, record) {
    record.id = job.id;
    record.status = job.status;
    record.job = job;
    var saved = persistArchiveJob(record);
    renderArchiveJob(job);
    archiveJobMessage(job.error || (saved ? '' : 'Browser storage is unavailable. Keep job ID ' + job.id + ' for recovery in archive operations.'), !!job.error);
    window.clearTimeout(archiveJobTimer);
    if (job.status === 'queued' || job.status === 'running') archiveJobTimer = window.setTimeout(function() { refreshArchiveJob(false); }, 3000);
  }
  async function refreshArchiveJob(resume) {
    if (archiveJobBusy || !archiveJobRecord || !archiveJobRecord.id) return;
    var record = archiveJobRecord;
    archiveJobBusy = true;
    window.clearTimeout(archiveJobTimer);
    renderArchiveJob(record.job || null);
    try {
      var url = '/api/operations/jobs/' + encodeURIComponent(record.id);
      var job = await archiveJobRequest(url + (resume ? '/resume' : ''), resume ? 'POST' : 'GET');
      acceptArchiveJob(job, record);
    } catch (error) {
      archiveJobMessage(error.message + ' The saved job ID is retained. Check status or resume this job; no replacement job was created.', true);
    } finally {
      archiveJobBusy = false;
      renderArchiveJob(record.job || null);
    }
  }
  function initArchiveJobs() {
    archiveJobRecord = storedArchiveJob();
    document.getElementById('archiveJobRefresh').addEventListener('click', function() { refreshArchiveJob(false); });
    document.getElementById('archiveJobResume').addEventListener('click', function() { refreshArchiveJob(true); });
    if (HOSTED_MODE && archiveJobRecord) {
      renderArchiveJob(archiveJobRecord.job || null);
      if (archiveJobRecord.id) refreshArchiveJob(false);
    }
  }
  async function archiveSignature(body) {
    var digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)));
    return Array.from(new Uint8Array(digest)).map(function(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }
  async function publishArchiveMonths(archive, onProgress) {
    if (archive.legacyApproved === true && archive.operationsUnavailable === true && !archive.jobId) return publishLegacyArchiveMonths(archive, onProgress);
    // Older embedded browsers cannot create the durable request signature. Preserve
    // the original resumable, month-by-month workflow rather than failing before upload.
    if (!window.crypto || !window.crypto.subtle || !window.crypto.randomUUID) return publishLegacyArchiveMonths(archive, onProgress);
    var months = Object.keys(archive.months).sort();
    var body = { sourceName: archive.sourceFile, months: months.map(function(month) { return { month: month, rows: archive.months[month] }; }) };
    var signature = await archiveSignature(body), record = archiveJobRecord || storedArchiveJob();
    if (record && record.signature !== signature && !['completed', 'unavailable', 'rejected'].includes(record.status)) throw new Error('An earlier archive submission needs attention. Open archive operations and complete or recover it before starting another upload.');
    if (!record || record.signature !== signature || (record.status === 'completed' && !archive.jobId)) record = { key: archive.idempotencyKey || window.crypto.randomUUID(), signature: signature, sourceName: archive.sourceFile, status: 'submitting', id: null };
    archive.idempotencyKey = record.key;
    persistArchiveJob(record);
    archive.operationsUnavailable = false;
    var job, wasUncertain = record.status === 'uncertain';
    try {
      if (record.id) {
        job = await archiveJobRequest('/api/operations/jobs/' + encodeURIComponent(record.id), 'GET');
        if (job.status === 'failed' || job.status === 'paused') job = await archiveJobRequest('/api/operations/jobs/' + encodeURIComponent(record.id) + '/resume', 'POST');
      } else job = await archiveJobRequest('/api/operations/jobs', 'POST', body, record.key);
    } catch (error) {
      if (!record.id && !wasUncertain && error.status === 503 && error.code === 'operations_unavailable') {
        archive.operationsUnavailable = true;
        record.status = 'unavailable';
        persistArchiveJob(record);
      } else if (!record.id) {
        record.status = wasUncertain || !error.status || error.status >= 500 ? 'uncertain' : 'rejected';
        persistArchiveJob(record);
      }
      renderArchiveJob(record.job || null);
      throw error;
    }
    archive.jobId = job.id;
    acceptArchiveJob(job, record);
    if (onProgress) onProgress('', job.completedMonths, job.totalMonths, job);
    return job;
  }
  async function publishLegacyArchiveMonths(archive, onProgress) {
    var months = Object.keys(archive.months).sort();
    archive.publishedMonths = archive.publishedMonths || {};
    for (var index = 0; index < months.length; index++) {
      var month = months[index];
      if (archive.publishedMonths[month]) continue;
      onProgress(month, index + 1, months.length);
      var response = await fetch('/api/pitstop-history', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ month: month, rows: archive.months[month], sourceName: archive.sourceFile }) });
      var result = await response.json().catch(function() { return {}; });
      if (!response.ok) throw new Error(result.error || ('Historical upload failed for ' + month + ' (HTTP ' + response.status + ').'));
      archive.publishedMonths[month] = true;
    }
    if (archiveJobRecord && !archiveJobRecord.id) { archiveJobRecord.status = 'completed'; persistArchiveJob(archiveJobRecord); renderArchiveJob(null); }
    return { status: 'completed', legacy: true, completedMonths: months.length, totalMonths: months.length };
  }

  function initManualBackups() {
    var section = document.getElementById('manualBackups'), collection = document.getElementById('backupCollection'), fileInput = document.getElementById('restoreBackupInput');
    var download = document.getElementById('downloadManualBackup'), previewButton = document.getElementById('previewManualRestore'), confirmButton = document.getElementById('confirmManualRestore');
    var previewPanel = document.getElementById('manualRestorePreview'), message = document.getElementById('manualBackupMessage'), pending = null, busy = false;
    function status(text, error) { message.textContent = text; message.hidden = !text; message.classList.toggle('is-error', !!error); }
    function clear() { pending = null; previewPanel.hidden = true; }
    function setBusy(value) {
      busy = value;
      section.querySelectorAll('button, input, select').forEach(function(control) { control.disabled = value || !HOSTED_MODE; });
      previewButton.disabled = value || !HOSTED_MODE || !fileInput.files.length;
      confirmButton.disabled = value || !HOSTED_MODE || !pending || !pending.preview.missing;
    }
    async function api(url, body) {
      var response = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      var result = await response.json().catch(function() { return {}; });
      if (!response.ok) throw new Error(result.error || 'Backup request failed (HTTP ' + response.status + ').');
      return result;
    }
    function reset() { clear(); status('', false); setBusy(false); }
    collection.addEventListener('change', reset);
    fileInput.addEventListener('change', reset);
    document.getElementById('cancelManualRestore').addEventListener('click', reset);
    download.addEventListener('click', async function() {
      if (busy) return;
      setBusy(true); status('Preparing backup...', false);
      try {
        var backup = await api('/api/manual-values-backup?kind=' + collection.value);
        var url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })), link = document.createElement('a');
        link.href = url; link.download = 'daily-report-' + collection.value + '-' + backup.exportedAt.slice(0, 10) + '.json';
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        status('Backup downloaded. ' + Object.keys(backup.record.values).length + ' reporting dates.', false);
      } catch (error) { status(error.message, true); } finally { setBusy(false); }
    });
    previewButton.addEventListener('click', async function() {
      if (busy || !fileInput.files.length) return;
      clear(); setBusy(true); status('Validating backup...', false);
      try {
        var file = fileInput.files[0];
        if (file.size > 8 * 1024 * 1024) throw new Error('Backup exceeds the 8 MB limit.');
        var backup;
        try { backup = JSON.parse(await file.text()); } catch { throw new Error('Choose a valid JSON backup file.'); }
        var result = await api('/api/manual-values-restore?kind=' + collection.value, { action: 'preview', backup: backup });
        pending = { backup: backup, preview: result.preview };
        document.getElementById('restoreMissingCount').textContent = result.preview.missing;
        document.getElementById('restoreIdenticalCount').textContent = result.preview.identical;
        document.getElementById('restoreDifferentCount').textContent = result.preview.existingDifferent;
        previewPanel.hidden = false;
        status(result.preview.missing ? 'Preview ready. Existing values will not be overwritten.' : 'Nothing is missing. No restore is needed.', false);
      } catch (error) { status(error.message, true); } finally { setBusy(false); }
    });
    confirmButton.addEventListener('click', async function() {
      if (busy || !pending) return;
      setBusy(true); status('Restoring missing values...', false);
      try {
        var result = await api('/api/manual-values-restore?kind=' + collection.value, { action: 'confirm', backup: pending.backup, expectedRevision: pending.preview.revision });
        clear(); status(result.restored + ' missing values restored. Existing values were retained.', false);
      } catch (error) { clear(); status(error.message, true); } finally { setBusy(false); }
    });
    setBusy(false);
    if (!HOSTED_MODE) status('Report backups require the hosted Data Upload Centre.', true);
  }

  function init() {
    initArchiveJobs();
    initManualBackups();
    initPinGate();
    startConcurrencyHeartbeat();
    var fileInput = document.getElementById('fileInput'), dropzone = document.getElementById('dropzone'), uploadButton = document.getElementById('uploadButton'), cancelUploadButton = document.getElementById('cancelUploadButton'), pendingFile = null, pendingSummary = document.getElementById('pendingFile'), pendingFileName = document.getElementById('pendingFileName');
    var masterFileInput = document.getElementById('masterFileInput'), masterChooseButton = document.getElementById('masterChooseButton'), masterConfirmButton = document.getElementById('masterConfirmButton'), masterCancelButton = document.getElementById('masterCancelButton'), masterPending = document.getElementById('masterPending'), masterPendingName = document.getElementById('masterPendingName'), masterPendingStats = document.getElementById('masterPendingStats'), masterMessage = document.getElementById('masterMessage'), pendingMaster = null;
    var reviewPanel = document.getElementById('masterReviewPanel'), reviewBody = document.getElementById('masterReviewBody'), reviewAck = document.getElementById('masterReviewAck'), reviewAckLabel = document.getElementById('masterReviewAckLabel'), masterBusy = false, selectionVersion = 0;
    var historyFileInput = document.getElementById('historyFileInput'), historyChooseButton = document.getElementById('historyChooseButton'), historyConfirmButton = document.getElementById('historyConfirmButton'), historyCancelButton = document.getElementById('historyCancelButton'), historyPending = document.getElementById('historyPending'), historyPendingName = document.getElementById('historyPendingName'), historyPendingStats = document.getElementById('historyPendingStats'), historyPendingState = document.getElementById('historyPendingState'), historyMessage = document.getElementById('historyMessage'), pendingHistory = null;
    var historyLegacyButton = document.getElementById('historyLegacyButton'), historyBusy = false;
    var grafanaArchiveMonth = document.getElementById('grafanaArchiveMonth'), grafanaPreviewButton = document.getElementById('grafanaPreviewButton'), grafanaConfirmButton = document.getElementById('grafanaConfirmButton'), grafanaCancelButton = document.getElementById('grafanaCancelButton'), grafanaArchivePreview = document.getElementById('grafanaArchivePreview'), grafanaPreviewMonth = document.getElementById('grafanaPreviewMonth'), grafanaPreviewRange = document.getElementById('grafanaPreviewRange'), grafanaPreviewMetrics = document.getElementById('grafanaPreviewMetrics'), grafanaPreviewWarning = document.getElementById('grafanaPreviewWarning'), grafanaPreviewState = document.getElementById('grafanaPreviewState'), grafanaArchiveMessage = document.getElementById('grafanaArchiveMessage'), pendingGrafanaMonth = '';
    grafanaArchiveMonth.value = previousCalendarMonth();
    grafanaArchiveMonth.max = previousCalendarMonth();
    function clearStagedFile(showReadyMessage) {
      pendingFile = null;
      uploadButton.hidden = true;
      cancelUploadButton.hidden = true;
      pendingSummary.hidden = true;
      pendingFileName.textContent = '-';
      selectionVersion += 1;
      reviewPanel.hidden = true;
      reviewAck.checked = false;
      if (showReadyMessage) setMessage('');
    }
    function updateMasterControls() {
      var pending = pendingMaster || pendingFile;
      var ready = pending && pending.review.canConfirm && (!pending.review.requiresAcknowledgement || reviewAck.checked);
      uploadButton.disabled = masterBusy || !ready;
      masterConfirmButton.disabled = masterBusy || !ready;
      [masterChooseButton, masterFileInput, masterCancelButton, fileInput, cancelUploadButton, document.getElementById('chooseButton'), document.getElementById('dropChooseButton'), document.getElementById('sharePointButton')].forEach(function(control) { control.disabled = masterBusy; });
      reviewAck.disabled = masterBusy;
      reviewPanel.setAttribute('aria-busy', String(masterBusy));
    }
    function renderMasterReview(pending) {
      var report = pending.review;
      function valueCell(value) { return value === null || value === undefined || value === '' ? '<span class="review-empty">(empty)</span>' : escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value); }
      function diffTable(rows, caption) {
        return '<div class="review-table-wrap" tabindex="0" role="region" aria-label="' + escapeHtml(caption) + '"><table class="review-table"><caption>' + escapeHtml(caption) + '</caption><thead><tr><th scope="col">Branch</th><th scope="col">Field</th><th scope="col">Current</th><th scope="col">New</th></tr></thead><tbody>' + rows.map(function(row) { return '<tr><th scope="row">' + escapeHtml(row.branch || '(missing Branch)') + '</th><td>' + escapeHtml(row.field) + '</td><td>' + valueCell(row.current) + '</td><td>' + valueCell(row.candidate) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      }
      function section(title, count, body, open) { return '<details class="review-section"' + (open ? ' open' : '') + '><summary>' + escapeHtml(title) + ' <span>' + formatNumber(count) + '</span></summary>' + (count ? body : '<p class="review-empty">None.</p>') + '</details>'; }
      function issues(items) { return '<ul class="review-issues">' + items.map(function(item) { return '<li><strong>' + escapeHtml(item.branch || 'Master') + (item.row ? ' (data row ' + item.row + ')' : '') + '</strong> ' + escapeHtml(item.message) + '</li>'; }).join('') + '</ul>'; }
      function rowDiff(items, added) { return items.flatMap(function(item) { return Object.keys(item.values || {}).map(function(field) { return { branch: item.branch, field: field, current: added ? null : item.values[field], candidate: added ? item.values[field] : null }; }); }); }
      var changes = report.changed.flatMap(function(item) { return item.fields.map(function(field) { return Object.assign({ branch: item.branch }, field); }); });
      document.getElementById('masterReviewSummary').textContent = report.counts.added + ' added, ' + report.counts.removed + ' removed, ' + report.counts.changed + ' changed; ' + report.counts.warnings + ' warnings.';
      document.getElementById('masterReviewDecision').textContent = report.canConfirm ? 'Review ready. Confirming saves the uploaded Master values.' : 'Correct duplicate branches and missing essential fields in the file, then select it again.';
      document.getElementById('masterPendingState').textContent = report.canConfirm ? 'Review required' : 'Corrections required';
      reviewBody.innerHTML = section('Duplicate branches', report.duplicates.length, issues(report.duplicates), !!report.duplicates.length) + section('Missing essential fields', report.missingFields.length, issues(report.missingFields), !!report.missingFields.length) + section('Warnings', report.warnings.length, issues(report.warnings), !!report.warnings.length) + section('Added branches', report.added.length, diffTable(rowDiff(report.added, true), 'Added branch values'), false) + section('Removed branches', report.removed.length, diffTable(rowDiff(report.removed, false), 'Removed branch values'), !!report.removed.length) + section('Changed branches', report.changed.length, diffTable(changes, 'Changed field values'), !!report.changed.length);
      reviewPanel.hidden = false;
      reviewAckLabel.hidden = !report.requiresAcknowledgement;
      reviewAck.checked = false;
      updateMasterControls();
    }
    async function stageCandidate(file, fromWorkbook) {
      if (!file || masterBusy) return;
      clearStagedFile(true);
      clearStagedMaster(true);
      var version = ++selectionVersion;
      setUploadStep('review');
      setMasterMessage('Checking ' + file.name + ' against the latest Master...', false);
      try {
        if (!window.MasterReview) throw new Error('Master review is unavailable. Reload the upload centre before uploading.');
        if (/\.json$/i.test(file.name)) throw new Error('Choose an Excel workbook containing Pitstop Master.');
        var workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
        if (fromWorkbook && !SHEET_ALIASES['Pitstop Master'].some(function(name) { return !!workbook.Sheets[name]; })) throw new Error('Missing required sheet: Pitstop Master.');
        var candidate = parsePitstopMaster(workbook, file.name), latest = await latestMaster();
        if (version !== selectionVersion) return;
        candidate.baseline = latest.fingerprint;
        candidate.review = window.MasterReview.review(latest.rows, candidate.rows);
        if (fromWorkbook) {
          pendingFile = candidate;
          uploadButton.hidden = false; cancelUploadButton.hidden = false; pendingSummary.hidden = false;
          pendingFileName.textContent = file.name;
        } else pendingMaster = candidate;
        masterPendingName.textContent = file.name;
        masterPendingStats.textContent = formatNumber(candidate.rows.length) + ' rows; ' + formatNumber(candidate.activeMalaysia) + ' active Malaysia';
        masterPending.hidden = false;
        masterConfirmButton.hidden = false;
        masterCancelButton.hidden = false;
        renderMasterReview(candidate);
        setMasterMessage(candidate.hasRelocations ? 'Pitstop Relocations is present. This confirmation updates only Pitstop Master; existing relocations are retained.' : 'Review the differences before confirming this manual Master update.', false);
      } catch (error) {
        if (version !== selectionVersion) return;
        setMasterMessage(error.message || 'Could not validate this workbook.', true);
      }
    }
    async function stageFile(file) { return stageCandidate(file, true); }
    async function uploadPendingFile() {
      return confirmMasterUpload();
    }
    function setMasterMessage(message, isError) { masterMessage.textContent = message || ''; masterMessage.hidden = !message; masterMessage.classList.toggle('is-error', !!isError); }
    function clearStagedMaster(showReadyMessage) {
      pendingMaster = null;
      masterConfirmButton.hidden = true;
      masterCancelButton.hidden = true;
      masterPending.hidden = true;
      masterPendingName.textContent = '-';
      masterPendingStats.textContent = '';
      selectionVersion += 1;
      reviewPanel.hidden = true;
      reviewAck.checked = false;
      if (showReadyMessage) setMasterMessage('');
    }
    async function stageMasterFile(file) {
      return stageCandidate(file, false);
    }
    async function confirmMasterUpload() {
      var master = pendingMaster || pendingFile;
      if (masterBusy || !master || !master.review.canConfirm || (master.review.requiresAcknowledgement && !reviewAck.checked)) return;
      masterBusy = true;
      updateMasterControls();
      setMasterMessage('Verifying the latest Master before saving...', false);
      try {
        var latest = await latestMaster();
        if (latest.fingerprint !== master.baseline) {
          master.baseline = latest.fingerprint;
          master.review = window.MasterReview.review(latest.rows, master.rows);
          renderMasterReview(master);
          setMasterMessage('Another Master upload was detected. Nothing was saved. Review the refreshed differences and confirm again.', true);
          document.getElementById('masterReviewTitle').focus();
          return;
        }
        var nextWorkbook = Object.assign({}, latest.workbook, { sourceFile: master.sourceFile, loadedAt: new Date().toISOString(), pitstopMasterSourceFile: master.sourceFile, pitstopMasterLoadedAt: new Date().toISOString(), sheets: Object.assign({}, latest.workbook.sheets, { 'Pitstop Master': { rows: master.rows } }) });
        if (HOSTED_MODE) await saveHostedWorkbook(nextWorkbook, latest.etag);
        state.workbook = nextWorkbook;
        saveDashboardWorkbook();
        state.activeSheet = EXPECTED_SHEETS.find(function(name) { return !!state.workbook.sheets[name]; }) || 'Pitstop Master';
        clearStagedMaster(false);
        clearStagedFile(false);
        renderTabs(); renderPreview(); updateStatus('Loaded', false);
        setMasterMessage('Pitstop Master saved with the reviewed values.', false);
        showToast('Pitstop Master saved.');
      } catch (error) {
        setMasterMessage(error.message || 'Cloudflare could not save the Pitstop Master.', true);
      } finally {
        masterBusy = false;
        updateMasterControls();
      }
    }
    function setHistoryMessage(message, isError) { historyMessage.textContent = message || ''; historyMessage.hidden = !message; historyMessage.classList.toggle('is-error', !!isError); }
    function clearStagedHistory(showReadyMessage) {
      pendingHistory = null;
      historyConfirmButton.hidden = true;
      historyLegacyButton.hidden = true;
      historyCancelButton.hidden = true;
      historyPending.hidden = true;
      historyPendingName.textContent = '-';
      historyPendingStats.textContent = '';
      historyPendingState.textContent = 'Ready to confirm';
      if (showReadyMessage) setHistoryMessage('');
    }
    async function stageHistoryFile(file) {
      if (!file || historyBusy) return;
      clearStagedHistory(false);
      setHistoryMessage('Reading and validating ' + file.name + '…', false);
      try {
        var workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
        pendingHistory = parseHistoricalArchive(workbook, file.name);
        var monthCount = Object.keys(pendingHistory.months).length;
        historyPendingName.textContent = file.name;
        historyPendingStats.textContent = formatNumber(pendingHistory.rows.length) + ' rows · ' + formatNumber(monthCount) + ' months · ' + formatDateLabel(pendingHistory.from) + ' to ' + formatDateLabel(pendingHistory.to) + ' · ' + formatNumber(pendingHistory.totalSales) + ' sales';
        historyPending.hidden = false;
        historyConfirmButton.hidden = false;
        historyCancelButton.hidden = false;
        setHistoryMessage('Validation passed. Confirm to replace the months in this file. Other archived months, the workbook and Pitstop Master remain unchanged.', false);
        showToast('Historical archive validated.');
      } catch (error) {
        clearStagedHistory(false);
        setHistoryMessage(error.message || 'Could not read this historical archive.', true);
      }
    }
    async function confirmHistoryUpload(legacy) {
      if (!pendingHistory || !HOSTED_MODE || historyBusy) return;
      var archive = pendingHistory, months = Object.keys(archive.months).sort();
      if (legacy === true) {
        if (!archive.operationsUnavailable || archive.jobId) return;
        archive.legacyApproved = true;
      }
      historyBusy = true;
      historyConfirmButton.disabled = true;
      historyLegacyButton.disabled = true;
      historyCancelButton.disabled = true;
      historyChooseButton.disabled = true;
      try {
        var job = await publishArchiveMonths(archive, function(month, index, count, durableJob) {
          historyPendingState.textContent = durableJob ? durableJob.status : 'Uploading ' + index + ' of ' + count;
          setHistoryMessage(durableJob ? 'Archive job accepted: ' + durableJob.id + '. Progress is available in Archive jobs.' : 'Saving ' + month + '. Keep this page open for this legacy upload.', false);
        });
        clearStagedHistory(false);
        setHistoryMessage(job.legacy || job.status === 'completed' ? 'Historical archive saved: ' + formatNumber(archive.rows.length) + ' rows.' : 'Archive job ' + job.id + ' accepted. Processing continues on the server; you may close this page and return to Archive jobs.', false);
        showToast(job.legacy || job.status === 'completed' ? 'Historical archive saved.' : 'Archive job accepted.');
      } catch (error) {
        historyLegacyButton.hidden = !archive.operationsUnavailable || !!archive.jobId;
        setHistoryMessage((error.message || 'Historical archive upload failed.') + (archive.operationsUnavailable ? ' Retry durable upload, or choose Use legacy month upload to save months from this page.' : archive.legacyApproved ? ' ' + Object.keys(archive.publishedMonths || {}).length + ' of ' + months.length + ' months saved. Confirm again to resume the remaining legacy months.' : ' Check Archive jobs, or confirm this same file again to recover the existing request.'), true);
      } finally {
        historyBusy = false;
        historyConfirmButton.disabled = false;
        historyLegacyButton.disabled = false;
        historyCancelButton.disabled = false;
        historyChooseButton.disabled = false;
      }
    }
    function setGrafanaArchiveMessage(message, isError) {
      grafanaArchiveMessage.textContent = message || '';
      grafanaArchiveMessage.hidden = !message;
      grafanaArchiveMessage.classList.toggle('is-error', !!isError);
    }
    function clearGrafanaPreview(clearMessage) {
      pendingGrafanaMonth = '';
      grafanaArchivePreview.hidden = true;
      grafanaPreviewMonth.textContent = '-';
      grafanaPreviewRange.textContent = '';
      grafanaPreviewMetrics.innerHTML = '';
      grafanaPreviewWarning.hidden = true;
      grafanaPreviewWarning.innerHTML = '';
      grafanaPreviewState.textContent = 'Preview';
      if (clearMessage) setGrafanaArchiveMessage('', false);
    }
    async function previewGrafanaArchive() {
      if (!HOSTED_MODE) { setGrafanaArchiveMessage('Grafana archiving is available on the hosted Data Upload Centre.', true); return; }
      var month = grafanaArchiveMonth.value;
      clearGrafanaPreview(false);
      grafanaPreviewButton.disabled = true;
      grafanaPreviewButton.textContent = 'Fetching month...';
      setGrafanaArchiveMessage('Fetching daily ALL PITSTOP HTML rows from Grafana. Keep this page open.', false);
      try {
        var response = await fetch('/api/pitstop-history/grafana', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview', month: month }) });
        var result = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(result.error || ('Grafana archive preview failed (HTTP ' + response.status + ').'));
        var preview = result.preview || {}, unmatched = Array.isArray(preview.unmatchedNames) ? preview.unmatchedNames : [];
        pendingGrafanaMonth = preview.month;
        grafanaPreviewMonth.textContent = formatMonthLabel(preview.month);
        grafanaPreviewRange.textContent = formatDateLabel(preview.from) + ' to ' + formatDateLabel(preview.to);
        grafanaPreviewMetrics.innerHTML = '<div class="archive-metric"><span>Reporting days</span><strong>' + formatNumber(preview.reportingDays) + ' / ' + formatNumber(preview.calendarDays) + '</strong></div><div class="archive-metric"><span>Daily rows</span><strong>' + formatNumber(preview.rows) + '</strong></div><div class="archive-metric"><span>Pitstops</span><strong>' + formatNumber(preview.pitstops) + '</strong></div><div class="archive-metric"><span>Total sales</span><strong>' + formatNumber(preview.totalSales) + '</strong></div>';
        if (unmatched.length || preview.replacing) {
          var warnings = [];
          if (preview.replacing) warnings.push('<strong>This month is already archived.</strong> Confirming will replace only ' + escapeHtml(formatMonthLabel(preview.month)) + ' (' + formatNumber(preview.replacing.rows) + ' existing rows).');
          if (unmatched.length) warnings.push('<strong>' + formatNumber(unmatched.length) + ' Grafana name(s) do not match active Malaysia branches in Pitstop Master.</strong>' + escapeHtml(unmatched.slice(0, 20).join(', ')) + (unmatched.length > 20 ? ' and ' + formatNumber(unmatched.length - 20) + ' more.' : '.'));
          grafanaPreviewWarning.innerHTML = warnings.join('<br>');
          grafanaPreviewWarning.hidden = false;
        }
        grafanaArchivePreview.hidden = false;
        grafanaPreviewState.textContent = unmatched.length ? 'Check names' : preview.replacing ? 'Replace month' : 'Validated';
        setGrafanaArchiveMessage('Preview ready. Review the totals and unmatched names, then confirm the monthly archive.', false);
        showToast('Grafana month ready for review.');
      } catch (error) {
        clearGrafanaPreview(false);
        setGrafanaArchiveMessage(error.message || 'Grafana archive preview failed.', true);
      } finally {
        grafanaPreviewButton.disabled = false;
        grafanaPreviewButton.textContent = 'Fetch from Grafana';
      }
    }
    async function confirmGrafanaArchive() {
      if (!pendingGrafanaMonth || !HOSTED_MODE) return;
      var month = pendingGrafanaMonth;
      grafanaConfirmButton.disabled = true;
      grafanaCancelButton.disabled = true;
      grafanaPreviewState.textContent = 'Saving';
      setGrafanaArchiveMessage('Saving ' + formatMonthLabel(month) + ' to Cloudflare history.', false);
      try {
        var response = await fetch('/api/pitstop-history/grafana', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'confirm', month: month }) });
        var result = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(result.error || ('Monthly archive failed (HTTP ' + response.status + ').'));
        clearGrafanaPreview(false);
        setGrafanaArchiveMessage(formatMonthLabel(month) + ' saved successfully: ' + formatNumber(result.month && result.month.rows) + ' daily rows and ' + formatNumber(result.month && result.month.totalSales) + ' sales. Other archived months were preserved.', false);
        await loadHistoricalManifest();
        showToast(formatMonthLabel(month) + ' archived.');
      } catch (error) {
        grafanaPreviewState.textContent = 'Preview';
        setGrafanaArchiveMessage(error.message || 'Could not save the monthly Grafana archive.', true);
      } finally {
        grafanaConfirmButton.disabled = false;
        grafanaCancelButton.disabled = false;
      }
    }
    document.getElementById('chooseButton').addEventListener('click', function() { fileInput.click(); }); document.getElementById('dropChooseButton').addEventListener('click', function() { fileInput.click(); }); uploadButton.addEventListener('click', uploadPendingFile); cancelUploadButton.addEventListener('click', function() { clearStagedFile(true); clearStagedMaster(true); setUploadStep('select'); showToast('Selection cleared. The current workbook is still active.'); }); document.getElementById('templateButton').addEventListener('click', function() { window.XLSX.writeFile(workbookFromRows(), 'Daily Report Email 2026.xlsx'); showToast('Manual workbook template downloaded.'); }); document.getElementById('sharePointButton').addEventListener('click', function() { clearStagedFile(true); clearStagedMaster(true); setUploadStep('select'); loadSharePoint(stageFile); });
    reviewAck.addEventListener('change', updateMasterControls);
    masterChooseButton.addEventListener('click', function() { masterFileInput.click(); });
    masterConfirmButton.addEventListener('click', confirmMasterUpload);
    masterCancelButton.addEventListener('click', function() { clearStagedMaster(true); clearStagedFile(true); showToast('Pitstop Master selection cleared.'); });
    masterFileInput.addEventListener('change', function(event) { if (event.target.files && event.target.files[0]) stageMasterFile(event.target.files[0]); event.target.value = ''; });
    historyChooseButton.addEventListener('click', function() { historyFileInput.click(); });
    historyConfirmButton.addEventListener('click', confirmHistoryUpload);
    historyLegacyButton.addEventListener('click', function() { confirmHistoryUpload(true); });
    historyCancelButton.addEventListener('click', function() { clearStagedHistory(true); showToast('Historical archive selection cleared.'); });
    historyFileInput.addEventListener('change', function(event) { if (event.target.files && event.target.files[0]) stageHistoryFile(event.target.files[0]); event.target.value = ''; });
    grafanaPreviewButton.addEventListener('click', previewGrafanaArchive);
    grafanaConfirmButton.addEventListener('click', confirmGrafanaArchive);
    grafanaCancelButton.addEventListener('click', function() { clearGrafanaPreview(true); showToast('Grafana archive preview cleared.'); });
    grafanaArchiveMonth.addEventListener('change', function() { clearGrafanaPreview(true); });
    var backDashboardLink = document.getElementById('backDashboardLink');
    if (backDashboardLink) backDashboardLink.addEventListener('click', function(event) { event.preventDefault(); openDashboardWithUpload(); });
    fileInput.addEventListener('change', function(event) { if (event.target.files && event.target.files[0]) stageFile(event.target.files[0]); event.target.value = ''; });
    dropzone.addEventListener('click', function() { fileInput.click(); }); dropzone.addEventListener('keydown', function(event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); } }); dropzone.addEventListener('dragover', function(event) { event.preventDefault(); dropzone.classList.add('is-dragging'); }); dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('is-dragging'); }); dropzone.addEventListener('drop', function(event) { event.preventDefault(); dropzone.classList.remove('is-dragging'); stageFile(event.dataTransfer.files[0]); });
    document.getElementById('searchInput').addEventListener('input', function(event) { state.query = event.target.value; renderPreview(); });
    var sharePointControl = document.getElementById('sharePointButton');
    if (HOSTED_MODE && sharePointControl) sharePointControl.hidden = true;
    renderTabs(); renderPreview(); updateStatus('Ready', false); setUploadStep('select');
    if (HOSTED_MODE) { loadHostedWorkbook(); loadHistoricalManifest(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
