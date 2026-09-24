(function(root) {
  'use strict';

  var aliases = {
    Branch: ['branch', 'pitstop', 'name', 'branchname', 'pitstopname'],
    State: ['state', 'statehub', 'hub'],
    Type: ['type', 'channel'],
    Tier: ['tier'],
    branch_status: ['branchstatus', 'status'],
    Country: ['country']
  };
  var essentials = ['Branch', 'State', 'Type', 'branch_status', 'Country'];
  var states = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Penang', 'Perak', 'Perlis', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya'];
  function text(value) { return value === undefined || value === null ? '' : String(value); }
  function key(value) { return text(value).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function branchKey(value) { return text(value).trim().replace(/\s+/g, ' ').toLowerCase(); }
  function fieldName(name) { return Object.keys(aliases).find(function(field) { return aliases[field].indexOf(key(name)) !== -1; }) || name; }
  function fields(row) {
    var result = Object.create(null);
    if (row && typeof row === 'object' && !Array.isArray(row)) Object.keys(row).forEach(function(name) { result[fieldName(name)] = row[name]; });
    return result;
  }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
      if (value instanceof Date) return value.toISOString();
      return Object.fromEntries(Object.keys(value).map(function(name) { return [name, clone(value[name])]; }));
    }
    return value === undefined ? null : value;
  }
  function canonicalState(value) {
    var normalized = key(value).replace(/^(wilayahpersekutuan|wp)/, '');
    if (['penang', 'pulaupinang', 'ppinang', 'pinang'].indexOf(normalized) !== -1) return 'Penang';
    if (normalized === 'malacca') return 'Melaka';
    if (normalized === 'kl') return 'Kuala Lumpur';
    return states.find(function(state) { return key(state) === normalized; }) || text(value).trim();
  }
  function issue(code, entry, field, message, extra) {
    return Object.assign({ code: code, branch: text(entry.values.Branch).trim(), row: entry.index + 1, field: field, message: message }, extra || {});
  }
  function entries(rows) {
    return rows.map(function(row, index) {
      var values = fields(row);
      return { index: index, values: values, key: branchKey(values.Branch), source: row };
    });
  }
  function snapshot(entry) { return { branch: text(entry.values.Branch).trim(), row: entry.index + 1, values: clone(entry.source) }; }

  // Diff snapshots preserve every uploaded value. Normalization is used only for matching and warnings.
  function review(currentRows, candidateRows, performanceRows) {
    var result = { version: 1, canConfirm: true, requiresAcknowledgement: false, counts: {}, added: [], removed: [], changed: [], duplicates: [], missingFields: [], warnings: [] };
    if (!Array.isArray(currentRows) || !Array.isArray(candidateRows)) throw new TypeError('Master review requires current and candidate row arrays.');
    if (performanceRows !== undefined && !Array.isArray(performanceRows)) throw new TypeError('Performance rows must be an array.');
    var current = entries(currentRows), candidate = entries(candidateRows), currentMap = new Map(), candidateMap = new Map(), similar = new Map();
    current.forEach(function(entry) {
      if (currentMap.has(entry.key) && entry.key) result.warnings.push(issue('current_duplicate', entry, 'Branch', 'The current Master already contains this branch more than once.'));
      if (!currentMap.has(entry.key)) currentMap.set(entry.key, entry);
    });
    if (!candidate.length) result.missingFields.push({ code: 'empty_master', branch: '', row: null, field: 'Branch', message: 'The candidate Master contains no rows.' });
    // Keep the last uploaded record for each branch, preserving its complete values.
    var resolved = new Map();
    candidate.forEach(function(entry) {
      var identity = entry.key || entry;
      if (resolved.has(identity)) {
        var previous = resolved.get(identity);
        result.duplicates.push(issue('duplicate_branch', entry, 'Branch', 'Data row ' + (entry.index + 1) + ' replaces duplicate data row ' + (previous.index + 1) + '. Only the last occurrence will be saved.', { rows: [previous.index + 1, entry.index + 1] }));
      }
      resolved.set(identity, entry);
    });
    candidate = Array.from(resolved.values());
    result.rows = candidate.map(function(entry) { return clone(entry.source); });
    candidate.forEach(function(entry) {
      essentials.forEach(function(field) {
        if (!text(entry.values[field]).trim()) result.missingFields.push(issue('missing_essential', entry, field, field + ' is required.'));
      });
      if (!text(entry.values.Tier).trim()) result.warnings.push(issue('missing_tier', entry, 'Tier', 'Tier is missing. Check the branch classification.'));
      if (!candidateMap.has(entry.key)) candidateMap.set(entry.key, entry);
      var compact = key(entry.values.Branch);
      if (compact && similar.has(compact) && similar.get(compact).key !== entry.key) result.warnings.push(issue('similar_branch', entry, 'Branch', 'Branch differs only by spacing or punctuation from ' + text(similar.get(compact).values.Branch) + '. Check for a duplicate.'));
      if (compact) similar.set(compact, entry);
      if (text(entry.values.Type).trim() && ['HQ', 'BP'].indexOf(text(entry.values.Type).trim().toUpperCase()) === -1) result.warnings.push(issue('unrecognized_type', entry, 'Type', 'Expected HQ or BP; verify this Type before confirming.'));
      if (text(entry.values.branch_status).trim() && ['active', 'inactive'].indexOf(text(entry.values.branch_status).trim().toLowerCase()) === -1) result.warnings.push(issue('unrecognized_status', entry, 'branch_status', 'Expected active or inactive; verify this status before confirming.'));
      var country = text(entry.values.Country).trim().toUpperCase(), state = canonicalState(entry.values.State), expected = '';
      if (compact.indexOf('telukintan') !== -1) expected = 'Perak';
      if (compact.indexOf('presint15putrajaya') !== -1 || compact.indexOf('presint15') !== -1) expected = 'Putrajaya';
      if (compact === 'bpputrajaya') expected = 'Putrajaya';
      if (expected && (state !== expected || ['MY', 'MALAYSIA'].indexOf(country) === -1)) result.warnings.push(issue('known_geography', entry, 'State', 'Check geography: ' + text(entry.values.Branch) + ' is expected in ' + expected + ', Malaysia.', { current: clone(entry.values.State), expected: expected, expectedCountry: 'Malaysia' }));
      if (['MY', 'MALAYSIA'].indexOf(country) !== -1 && state && states.indexOf(state) === -1) result.warnings.push(issue('unrecognized_state', entry, 'State', 'Unrecognized Malaysia state: ' + text(entry.values.State) + '.'));
      if (country && ['MY', 'MALAYSIA', 'ID', 'IDN', 'INDONESIA'].indexOf(country) === -1) result.warnings.push(issue('unrecognized_country', entry, 'Country', 'Verify the country value: ' + text(entry.values.Country) + '.'));
      if (['ID', 'IDN', 'INDONESIA'].indexOf(country) !== -1 && states.indexOf(state) !== -1) result.warnings.push(issue('country_state_mismatch', entry, 'Country', 'Country is Indonesia but State names a Malaysia state.'));
      var before = currentMap.get(entry.key);
      if (!before || !entry.key) { result.added.push(snapshot(entry)); return; }
      var names = Array.from(new Set(Object.keys(before.values).concat(Object.keys(entry.values))));
      var changes = names.filter(function(name) { return JSON.stringify(clone(before.values[name])) !== JSON.stringify(clone(entry.values[name])); }).map(function(name) { return { field: name, current: clone(before.values[name]), candidate: clone(entry.values[name]) }; });
      if (changes.length) result.changed.push({ branch: text(entry.values.Branch).trim(), row: entry.index + 1, current: clone(before.source), candidate: clone(entry.source), fields: changes });
    });
    current.forEach(function(entry) { if (!candidateMap.has(entry.key)) result.removed.push(snapshot(entry)); });
    var warned = new Set();
    entries(performanceRows || []).forEach(function(entry) {
      if (!entry.key) return;
      var match = candidateMap.get(entry.key), code = '', field = 'Branch', message = '';
      if (!match) { code = 'performance_branch_missing'; message = 'Performance includes this branch, which is absent from the candidate Master.'; }
      else if (text(match.values.branch_status).trim().toLowerCase() === 'inactive') { code = 'performance_inactive_branch'; message = 'Performance includes a branch marked inactive in the candidate Master.'; }
      else if (text(entry.values.State).trim() && canonicalState(entry.values.State) !== canonicalState(match.values.State)) { code = 'performance_state_mismatch'; field = 'State'; message = 'Performance State (' + text(entry.values.State) + ') differs from candidate State (' + text(match.values.State) + ').'; }
      if (code && !warned.has(code + entry.key)) { warned.add(code + entry.key); result.warnings.push(issue(code, entry, field, message, { source: 'performance' })); }
    });
    result.canConfirm = result.missingFields.length === 0;
    result.requiresAcknowledgement = result.duplicates.length > 0 || result.removed.length > 0 || result.changed.length > 0;
    result.counts = { current: current.length, candidate: candidate.length, added: result.added.length, removed: result.removed.length, changed: result.changed.length, unchanged: candidate.length - result.added.length - result.changed.length, duplicates: result.duplicates.length, missingFields: result.missingFields.length, warnings: result.warnings.length };
    return result;
  }

  var api = Object.freeze({ review: review });
  root.MasterReview = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
