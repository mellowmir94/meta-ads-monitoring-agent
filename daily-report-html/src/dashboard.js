(function() {
  'use strict';

  var STORAGE_KEY = 'daily-report-dashboard-latest-data';
  var B2W_LOCAL_STORAGE_KEY = 'daily-report-dashboard-b2w-values';
  var RSA_LOCAL_STORAGE_KEY = 'daily-report-dashboard-rsa-values';
  var BGARAGE_SUMMARY_LOCAL_STORAGE_KEY = 'daily-report-dashboard-bgarage-summary-values';
  var INDONESIA_SUMMARY_LOCAL_STORAGE_KEY = 'daily-report-dashboard-indonesia-summary-values';
  var SOURCE_SNAPSHOT_STORAGE_KEY = 'daily-report-dashboard-source-snapshots-v1';
  var DRAFT_RECOVERY_PREFIX = 'daily-report-drafts-v1:';
  var draftRecoveryKey = DRAFT_RECOVERY_PREFIX + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random());
  var recoveryCandidates = {}, recoverySourceKeys = [], draftStorageError = '', draftReviewOpen = false;
  var archiveState = { busy: false, date: '', latest: 0, versions: [], selected: null, pending: null, error: '', before: null, request: 0 };
  var SOURCE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  var SOURCE_SNAPSHOT_LIMIT = 12;
  var HOSTED_MODE = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  // Raw workbook handoff from the standalone Data Upload Centre.
  var SHARED_WORKBOOK_KEY = 'daily-report-dashboard-workbook';
  var SHAREPOINT_SOURCE_KEY = 'daily-report-dashboard-sharepoint-source';
  var numberFormatter = new Intl.NumberFormat('en-MY', { maximumFractionDigits: 0 });
  var seedPayload = {
    title: 'Daily Report Dashboard',
    benchmark: 1935,
    dayDates: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14', '2026-06-15', '2026-06-16', '2026-06-17'],
    sales: [[1117, 1067], [1187, 1057], [1122, 900], [997, 798], [941, 815], [1112, 904], [1238, 987], [1127, 984], [959, 858], [965, 743], [994, 819], [945, 790], [1061, 878], [1134, 863], [1070, 896], [925, 781], [981, 869]],
    rsa: [[29, 17, 0, 46], [39, 19, 0, 58], [40, 25, 0, 65], [31, 17, 1, 49], [30, 24, 2, 56], [33, 22, 4, 59], [27, 24, 0, 51], [26, 21, 1, 48], [40, 29, 3, 72], [15, 19, 5, 39], [24, 19, 5, 48], [27, 19, 2, 48], [32, 13, 2, 47], [20, 16, 2, 38], [41, 38, 3, 82], [24, 9, 2, 35], [42, 18, 2, 62]],
    resq: [[2, 0, 3, 4], [3, 0, 0, 2], [6, 0, 2, 2], [5, 1, 1, 1], [5, 1, 2, 1], [7, 1, 2, 3], [5, 2, 0, 2], [7, 2, 3, 1], [1, 1, 1, 0], [7, 1, 0, 0], [4, 1, 2, 2], [9, 0, 0, 0], [4, 0, 1, 0], [6, 0, 2, 3], [3, 1, 0, 2], [5, 1, 1, 1], [9, 0, 0, 0]],
    warranty: [[102, 0, 1], [150, 0, 1], [155, 3, 0], [129, 5, 0], [121, 16, 0], [139, 4, 3], [123, 0, 0], [168, 2, 0], [126, 2, 0], [117, 2, 0], [104, 1, 0], [111, 4, 1], [159, 3, 0], [92, 0, 0], [132, 4, 0], [108, 2, 0], [92, 0, 0]],
    pit: [
      ['B2C', 'HQ Pasir Gudang', 'Southern', 'Johor', 'Tier 1', 12, 12, 'green'], ['B2C', 'HQ Perling', 'Southern', 'Johor', 'Tier 1', 12, 13, 'green'], ['B2C', 'HQ Mutiara Rini', 'Southern', 'Johor', 'Tier 1', 12, 9, 'red'], ['B2C', 'HQ Melaka', 'Southern', 'Melaka', 'Tier 1', 12, 22, 'green'], ['B2C', 'HQ Senawang', 'Southern', 'N. Sembilan', 'Tier 1', 12, 19, 'green'], ['B2C', 'HQ Presint 15 Putrajaya', 'Central', 'Putrajaya', 'Tier 1', 12, 22, 'green'], ['B2C', 'HQ Setapak', 'Central', 'Kuala Lumpur', 'Tier 1', 12, 23, 'green'], ['B2C', 'HQ Pudu', 'Central', 'Kuala Lumpur', 'Tier 1', 12, 8, 'red'], ['B2C', 'HQ Seksyen 7', 'Central', 'Selangor', 'Tier 1', 12, 25, 'green'], ['B2C', 'HQ Kajang Taman Sri Jenaris', 'Central', 'Selangor', 'Tier 1', 12, 4, 'red'], ['B2C', 'HQ Dengkil', 'Central', 'Selangor', 'Tier 2', 9, 17, 'green'], ['B2C', 'HQ Klang', 'Central', 'Selangor', 'Tier 2', 9, 2, 'red'], ['B2C', 'HQ Georgetown', 'Northern', 'Penang', 'Tier 1', 12, 4, 'red'], ['B2C', 'HQ Sungai Nibong', 'Northern', 'Penang', 'Tier 2', 9, 12, 'green'], ['B2C', 'HQ Bandar Puteri Jaya', 'Northern', 'Kedah', 'Tier 1', 12, 14, 'green'], ['B2B2C', 'BP Skudai', 'Southern', 'Johor', 'Tier 1', 12, 15, 'green'], ['B2B2C', 'BP Johor Jaya', 'Southern', 'Johor', 'Tier 1', 12, 16, 'green'], ['B2B2C', 'BP Kg Melayu Majidee', 'Southern', 'Johor', 'Tier 1', 12, 7, 'red'], ['B2B2C', 'BP Nilai', 'Southern', 'N. Sembilan', 'Tier 1', 12, 17, 'green'], ['B2B2C', 'BP Puchong', 'Central', 'Selangor', 'Tier 1', 12, 14, 'green'], ['B2B2C', 'BP Telok Panglima Garang', 'Central', 'Selangor', 'Tier 2', 9, 6, 'red'], ['B2B2C', 'BP Kamunting', 'Northern', 'Perak', 'Tier 1', 12, 19, 'green'], ['B2B2C', 'BP Taiping', 'Northern', 'Perak', 'Tier 1', 12, 1, 'red'], ['B2B2C', 'BP Jawi', 'Northern', 'Penang', 'Tier 2', 9, 41, 'green'], ['B2B2C', 'BP Alor Setar', 'Northern', 'Kedah', 'Tier 1', 12, 13, 'green'], ['B2B2C', 'BP Kuala Terengganu 3', 'Eastern', 'Terengganu', 'Tier 1', 12, 5, 'red'], ['B2B2C', 'BP Kemaman', 'Eastern', 'Terengganu', 'Tier 2', 9, 20, 'green'], ['B2B2C', 'BP Temerloh', 'Eastern', 'Pahang', 'Tier 2', 9, 0, 'red'], ['B2B2C', 'BP Taman BDC Kuching', 'Borneo', 'Sarawak', 'Tier 1', 12, 8, 'red']
    ],
    bgarage: [
      ['2026-06-17', 'BGarage TTDI', 4375, 1932.90, 58229.88, 113750, 1, 1, 1, 4, 15],
      ['2026-06-17', 'BGarage Puncak Alam', 4375, 1422.60, 35086.01, 113750, 0, 0, 1, 11, 12],
      ['2026-06-17', 'TUHU Puchong', 0, 0, 0, 0, 0, 0, 0, 0, 12],
      ['2026-06-17', 'BGarage Kajang', 4375, 0, 7210.67, 113750, 0, 0, 0, 1, 15]
    ]
  };

  var state = {
    data: null,
    sourceName: 'Built-in reference dataset',
    view: 'overview',
    range: 'month',
    from: '',
    to: '',
    showB2c: true,
    showB2b2c: true,
    dailyDetailChannel: 'all',
    specialChannel: 'all',
    regionTierFocus: 'all',
    pitStatus: 'all',
    pitChannels: ['HQ', 'WH'],
    pitState: 'all',
    pitRegion: 'all',
    pitTier: 'all',
    pitArrange: 'state',
    pitSearch: '',
    selectedKey: '',
    bgarageStatus: 'all',
    bgarageSearch: '',
    rsaType: 'all',
    resqState: 'all',
    warrantyDate: '',
    emailRankingCollapsed: true,
    emailWarehouseHidden: true,
    weeklyRankingPreset: 'current',
    weeklyRankingSalesByKey: null,
    weeklyRankingSyncKey: '',
    weeklyRankingLoading: false,
    weeklyRankingError: '',
    weekendAverageActive: false,
    weekendSalesRows: [],
    weekendSalesSyncKey: '',
    weekendSalesLoading: false,
    weekendSalesError: '',
    weekendPitstopSalesByKey: null,
    weekendPitstopSyncKey: '',
    serviceFullscreenIndex: -1,
    cloudLoading: false,
    cloudError: '',
    cloudUpdatedAt: '',
    masterFingerprint: '',
    forceDataRefresh: false,
    grafanaPitstopLastSync: '',
    grafanaPitstopSource: '',
    grafanaPitstopError: '',
    grafanaPitstopChannelTotals: null,
    grafanaPitstopSalesByKey: null,
    pitstopTotalsSyncRange: '',
    grafanaEmailSalesRows: [],
    grafanaEmailSalesSource: '',
    grafanaEmailSalesGeneratedAt: '',
    emailSalesSyncRange: '',
    emailSalesLoading: false,
    emailSalesError: '',
    grafanaRsaRows: [],
    grafanaRsaSource: '',
    grafanaRsaGeneratedAt: '',
    rsaSyncRange: '',
    rsaApiAvailable: false,
    rsaLoading: false,
    rsaError: '',
    grafanaResqRows: [],
    grafanaResqSource: '',
    grafanaResqGeneratedAt: '',
    resqSyncRange: '',
    resqApiAvailable: false,
    resqLoading: false,
    resqError: '',
    grafanaWarrantyRows: [],
    grafanaWarrantySource: '',
    grafanaWarrantyGeneratedAt: '',
    warrantySyncRange: '',
    warrantyApiAvailable: false,
    warrantyLoading: false,
    warrantyError: '',
    manualB2wValues: {},
    manualRsaValues: {},
    manualBGarageSummaryValues: {},
    manualIndonesiaSummaryValues: {},
    b2wSource: '',
    b2wUpdatedAt: '',
    b2wSharePointSyncedAt: '',
    rsaValuesUpdatedAt: '',
    bgarageValuesUpdatedAt: '',
    indonesiaValuesUpdatedAt: '',
    bgarageValuesError: '',
    indonesiaValuesError: '',
    manualSourcesReady: { b2w: !HOSTED_MODE, rsa: !HOSTED_MODE, bgarage: !HOSTED_MODE, indonesia: !HOSTED_MODE },
    sourceFallbacks: {},
    sourceLastSuccess: {},
    summaryDirty: { operations: false, bgarage: false, indonesia: false },
    summaryDrafts: {},
    manualRevisions: { b2w: {}, rsa: {}, bgarage: {}, indonesia: {} },
    summaryOpened: false,
    pitstopReconciliation: {},
    summaryRenderRevision: 0,
    summaryCopySnapshot: null,
    bgarageSummaryDate: '',
    indonesiaSummaryDate: '',
    b2cStateSummaryPreset: 'previous',
    summaryNetworkSalesByKey: null,
    summaryNetworkSyncKey: '',
    summaryNetworkLoading: false,
    summaryNetworkError: '',
    bgarageSummarySaving: false,
    indonesiaSummarySaving: false,
    manualServiceSaving: false,
    b2wLoading: false,
    b2wSyncing: false,
    b2wError: '',
    pitstopHistoryManifest: null,
    pitstopSyncRange: ''
  };
  // Header-led widths keep the three operational tables compact without
  // squeezing their labels or values. These dimensions are also reused by
  // the Outlook copy formatter so the dashboard and pasted email agree.
  var OPERATIONS_TABLE_COLUMN_WIDTHS = {
    rsa: [100, 150, 154, 124, 130, 100],
    resq: [100, 150, 156, 128, 152, 136],
    warranty: [100, 228, 238, 234]
  };
  var pitstopResponseCache = {};
  var activePitstopRequest = null;
  var overwriteConfirmResolver = null;
  var overwriteConfirmTrigger = null;
  var emailSalesResponseCache = {};
  var activeEmailSalesRequest = null;
  var rsaResponseCache = {};
  var activeRsaRequest = null;
  var resqResponseCache = {};
  var activeResqRequest = null;
  var warrantyResponseCache = {};
  var activeWarrantyRequest = null;
  var weekendSalesRequest = null;
  var summaryNetworkSalesRequest = null;
  var weeklyRankingSalesRequest = null;
  var PITSTOP_BROWSER_CACHE_MS = 10 * 60 * 1000;

  function sourceSnapshotRecordKey(sourceKey, rangeKey) {
    return String(sourceKey || '') + '::' + String(rangeKey || '');
  }

  function readSourceSnapshots() {
    try {
      var value = window.localStorage.getItem(SOURCE_SNAPSHOT_STORAGE_KEY);
      var parsed = value ? JSON.parse(value) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) { return {}; }
  }

  function writeSourceSnapshots(records) {
    try { window.localStorage.setItem(SOURCE_SNAPSHOT_STORAGE_KEY, JSON.stringify(records || {})); } catch (_) {}
  }

  function rememberSuccessfulSourceSnapshot(sourceKey, rangeKey, payload) {
    if (!payload || typeof payload !== 'object') return payload;
    var records = readSourceSnapshots(), key = sourceSnapshotRecordKey(sourceKey, rangeKey), savedAt = Date.now();
    records[key] = { sourceKey: sourceKey, rangeKey: rangeKey, payload: payload, savedAt: savedAt, generatedAt: payload.generatedAt || '' };
    Object.keys(records).sort(function(left, right) { return numberValue(records[right] && records[right].savedAt) - numberValue(records[left] && records[left].savedAt); }).slice(SOURCE_SNAPSHOT_LIMIT).forEach(function(oldKey) { delete records[oldKey]; });
    writeSourceSnapshots(records);
    state.sourceLastSuccess[sourceKey] = payload.generatedAt || new Date(savedAt).toISOString();
    delete state.sourceFallbacks[sourceKey];
    return payload;
  }

  function recoverSuccessfulSourceSnapshot(sourceKey, rangeKey, error) {
    if (error && error.name === 'AbortError') return null;
    var record = readSourceSnapshots()[sourceSnapshotRecordKey(sourceKey, rangeKey)];
    if (!record || !record.payload || Date.now() - numberValue(record.savedAt) > SOURCE_SNAPSHOT_MAX_AGE_MS) return null;
    state.sourceFallbacks[sourceKey] = {
      savedAt: record.savedAt,
      generatedAt: record.generatedAt || record.payload.generatedAt || '',
      reason: error && error.message || 'Live source unavailable.'
    };
    state.sourceLastSuccess[sourceKey] = record.generatedAt || record.payload.generatedAt || new Date(record.savedAt).toISOString();
    return record.payload;
  }

  function refreshQuerySuffix() {
    return state.forceDataRefresh ? '&refresh=1' : '';
  }

  async function fetchSourceJson(url, sourceKey, rangeKey, signal, fallbackMessage) {
    try {
      var response = await fetch(url + refreshQuerySuffix(), { cache: 'no-store', credentials: 'same-origin', signal: signal });
      var result = await response.json().catch(function() { return {}; });
      if (!response.ok) throw new Error(result.error || fallbackMessage || ('Data source HTTP ' + response.status));
      return rememberSuccessfulSourceSnapshot(sourceKey, rangeKey, result);
    } catch (error) {
      var fallback = recoverSuccessfulSourceSnapshot(sourceKey, rangeKey, error);
      if (fallback) return fallback;
      throw error;
    }
  }

  function selectedRangeKey() {
    return (state.from || '') + '::' + (state.to || '');
  }

  function resetSummaryNetworkSales() {
    if (summaryNetworkSalesRequest) summaryNetworkSalesRequest.controller.abort();
    summaryNetworkSalesRequest = null;
    state.summaryNetworkSalesByKey = null;
    state.summaryNetworkSyncKey = '';
    state.summaryNetworkLoading = false;
    state.summaryNetworkError = '';
  }

  var WORKBOOK_SHEETS = {
    dailySales: ['Daily Sales', 'DailySales', 'Sales'],
    serviceWarranty: ['Service & Warranty', 'Service and Warranty', 'Services & Warranty', 'Services'],
    pitstops: ['Pitstops', 'Pit Stops', 'Pitstop'],
    pitstopMaster: ['Pitstop Master', 'Pitstop_Master', 'PitstopMaster', 'Master Pitstop'],
    pitstopRelocations: ['Pitstop Relocations', 'Pitstop Relocation', 'Relocations', 'Relocation'],
    bgarage: ['BGarage', 'BGarange', 'B Garage', 'B Garange', 'Garage'],
    settings: ['Settings'],
    indonesia: ['Indonesia', 'Bateriku Indonesia', 'Indonesia Sales']
  };
  var DEFAULT_PITSTOP_RELOCATIONS = [
    { from: 'HQ BUKIT PAYONG', to: 'HQ PADANG MIDIN', relocationDate: '2026-03-31' },
    { from: 'HQ BENUT', to: 'HQ BANDAR PONTIAN', relocationDate: '2026-02-26' },
    { from: 'WH SIMPANG AMPAT', to: 'HQ BUKIT MINYAK', relocationDate: '2026-02-13' }
  ];
  // One registry owns report naming, geography, and source-to-report
  // corrections. New aliases and pitstop corrections should be added here so
  // dashboards, summaries, and Outlook copies cannot drift independently.
  var REPORT_MAPPING_REGISTRY = {
    stateAliases: {
      johor: 'Johor', melaka: 'Melaka', malacca: 'Melaka',
      negeri9: 'N. Sembilan', negerisembilan: 'N. Sembilan', nsembilan: 'N. Sembilan', sembilan: 'N. Sembilan',
      putrajaya: 'Putrajaya', wilayahpersekutuanputrajaya: 'Putrajaya',
      kualalumpur: 'Kuala Lumpur', wilayahpersekutuankualalumpur: 'Kuala Lumpur', wpkl: 'Kuala Lumpur',
      selangor: 'Selangor', perak: 'Perak', penang: 'Penang', pulaupinang: 'Penang', ppinang: 'Penang',
      kedah: 'Kedah', perlis: 'Perlis', kelantan: 'Kelantan', terengganu: 'Terengganu',
      pahang: 'Pahang', sabah: 'Sabah', sarawak: 'Sarawak'
    },
    stateRegions: {
      Johor: 'Southern', Melaka: 'Southern', 'N. Sembilan': 'Southern',
      Putrajaya: 'Central', 'Kuala Lumpur': 'Central', Selangor: 'Central',
      Perak: 'Northern', Penang: 'Northern', Kedah: 'Northern', Perlis: 'Northern',
      Kelantan: 'Eastern', Terengganu: 'Eastern', Pahang: 'Eastern',
      Sabah: 'Borneo', Sarawak: 'Borneo'
    },
    pitstopStateOverrides: {},
    summary: { stateOrder: {}, pitstopOrder: {}, regionOrder: ['BORNEO', 'CENTRAL', 'EASTERN', 'SOUTHERN', 'NORTHERN'] }
  };
  function cleanKey(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function canonicalChannel(value) {
    var raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (raw === 'B2C' || raw === 'HQ') return 'HQ';
    if (raw === 'B2B2C' || raw === 'BP') return 'BP';
    if (raw === 'WH' || raw === 'WAREHOUSE') return 'WH';
    if (raw === 'HQC' || raw === 'HQCLOSED') return 'HQC';
    if (raw === 'BPC' || raw === 'BPCLOSED') return 'BPC';
    return String(value || '').trim();
  }

  function canonicalPitstopKey(value) { return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function pitstopMatchKeys(value) {
    var raw = String(value || '').trim().toUpperCase(), variants = [raw, raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim(), raw.split(',')[0].trim()];
    if (canonicalPitstopKey(raw) === 'BPJALANJOHORPONTIAN') variants.push('BP PONTIAN');
    // Grafana still returns the legacy HQ KLANG label. The Summary reports
    // the active location name HQ KAPAR while retaining the same sales row.
    if (['HQKLANG', 'HQKAPAR'].indexOf(canonicalPitstopKey(raw)) !== -1) variants.push(canonicalPitstopKey(raw) === 'HQKLANG' ? 'HQ KAPAR' : 'HQ KLANG');
    // Grafana's live BP panel labels this location as
    // “BPM TAPAH - HUTAN/HUTANG MELINTANG”, while Pitstop Master uses the
    // active operational name “BP TAPAH”. Treat both spellings as aliases.
    if (['BPMTAPAHHUTANMELINTANG', 'BPMTAPAHHUTANGMELINTANG'].indexOf(canonicalPitstopKey(raw)) !== -1) variants.push('BP TAPAH');
    var seen = {};
    return variants.map(canonicalPitstopKey).filter(function(key) { if (!key || seen[key]) return false; seen[key] = true; return true; });
  }
  function normalizePitstopRelocation(row) {
    var from = String(cell(row, ['relocation', 'from', 'old pitstop', 'old branch', 'source'], 0) || '').trim();
    var to = String(cell(row, ['to', 'new pitstop', 'new branch', 'destination'], 1) || '').trim();
    if (!from || !to) return null;
    return {
      from: from,
      to: to,
      relocationDate: dateValue(cell(row, ['relocation date', 'date relocation', 'effective date'], 6))
    };
  }
  function canonicalState(value) {
    var raw = String(value || '').trim(), key = cleanKey(raw);
    return REPORT_MAPPING_REGISTRY.stateAliases[key] || raw || 'Unassigned';
  }
  var PITSTOP_STATE_CORRECTIONS = {
    hqpresint15putrajaya: 'Putrajaya',
    bpputrajaya: 'Putrajaya',
    hqtelukintan: 'Perak',
    bptelukintanjlnchangkatjong: 'Perak'
  };
  function reportedPitstopState(name, value) {
    return PITSTOP_STATE_CORRECTIONS[cleanKey(name)] || canonicalState(value);
  }
  function regionForState(value) {
    var stateName = canonicalState(value);
    return REPORT_MAPPING_REGISTRY.stateRegions[stateName] || 'Unassigned';
  }
  REPORT_MAPPING_REGISTRY.pitstopStateOverrides = PITSTOP_STATE_CORRECTIONS;
  function canonicalTier(value) {
    var match = String(value || '').trim().match(/([1-3])/);
    return match ? 'Tier ' + match[1] : '';
  }
  function targetForTier(value) { var tier = canonicalTier(value); return tier === 'Tier 1' ? 12 : tier === 'Tier 2' ? 9 : tier === 'Tier 3' ? 7 : 0; }
  function isMalaysiaCountry(value) { var country = String(value || '').trim().toUpperCase(); return country === 'MY' || country === 'MALAYSIA'; }

  function cell(row, aliases, index) {
    if (Array.isArray(row)) return row[index];
    var keys = Object.keys(row || {});
    var aliasKeys = aliases.map(cleanKey);
    for (var i = 0; i < keys.length; i += 1) {
      if (aliasKeys.indexOf(cleanKey(keys[i])) !== -1) return row[keys[i]];
    }
    return undefined;
  }

  function optionalCell(row, aliases) { return Array.isArray(row) ? undefined : cell(row, aliases, 0); }
  function hasNonDateValue(row) {
    if (Array.isArray(row)) return row.slice(1).some(function(value) { return String(value === undefined || value === null ? '' : value).trim() !== ''; });
    return Object.keys(row || {}).some(function(key) { return cleanKey(key) !== 'date' && String(row[key] === undefined || row[key] === null ? '' : row[key]).trim() !== ''; });
  }

  function numberValue(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    // Excel exports may store currency values as text, for example
    // "RM4,375.00" or " RM1,932.90 ". Strip labels and separators before
    // converting so BGarage amounts remain numeric in the dashboard.
    var cleaned = String(value === undefined || value === null ? '' : value).replace(/,/g, '').replace(/[^0-9.+-]/g, '');
    var parsed = cleaned && cleaned !== '-' && cleaned !== '+' && cleaned !== '.' ? Number(cleaned) : NaN;
    return isFinite(parsed) ? parsed : 0;
  }

  function sanitizeB2wValues(values) {
    var clean = {};
    Object.keys(values && typeof values === 'object' && !Array.isArray(values) ? values : {}).forEach(function(date) {
      var value = Number(values[date]);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(value) && value >= 0 && value <= 1000000) clean[date] = value;
    });
    return clean;
  }

  function hasManualB2w(date) {
    return Object.prototype.hasOwnProperty.call(state.manualB2wValues || {}, date);
  }

  function manualB2wValue(date) {
    return hasManualB2w(date) ? numberValue(state.manualB2wValues[date]) : NaN;
  }

  function readLocalB2wValues() {
    try { return sanitizeB2wValues(JSON.parse(window.localStorage.getItem(B2W_LOCAL_STORAGE_KEY) || '{}')); }
    catch (_) { return {}; }
  }

  function writeLocalB2wValues(values) {
    try { window.localStorage.setItem(B2W_LOCAL_STORAGE_KEY, JSON.stringify(values || {})); } catch (_) {}
  }

  async function loadManualB2wValues() {
    state.b2wLoading = true;
    state.b2wError = '';
    try {
      if (!HOSTED_MODE) {
        state.manualB2wValues = readLocalB2wValues();
        state.b2wSource = 'Browser saved input';
      } else {
        var response = await fetch('/api/b2w', { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('B2W values could not be loaded.');
        var payload = await response.json();
        state.manualB2wValues = sanitizeB2wValues(payload && payload.values);
        state.manualRevisions.b2w = payload.revisions || {};
        state.b2wSource = payload && payload.source || 'Manual dashboard input';
        state.b2wUpdatedAt = payload && payload.updatedAt || '';
        state.b2wSharePointSyncedAt = payload && payload.sharePointSyncedAt || '';
      }
    } catch (error) {
      state.b2wError = error && error.message || 'B2W values could not be loaded.';
    } finally {
      state.b2wLoading = false;
      state.manualSourcesReady.b2w = true;
      render();
    }
  }

  async function syncB2wFromSharePoint() {
    if (!HOSTED_MODE || state.b2wSyncing) return;
    state.b2wSyncing = true;
    state.b2wError = '';
    render();
    try {
      var response = await fetch('/api/b2w/sharepoint', { method: 'POST', headers: { accept: 'application/json' } });
      var payload = await response.json().catch(function() { return {}; });
      if (!response.ok) throw new Error(payload.error || 'B2W SharePoint sync failed.');
      state.manualB2wValues = sanitizeB2wValues(payload.values);
      state.manualRevisions.b2w = payload.revisions || {};
      state.b2wSource = payload.source || 'SharePoint read-only';
      state.b2wUpdatedAt = payload.updatedAt || '';
      state.b2wSharePointSyncedAt = payload.sharePointSyncedAt || '';
      syncSummaryDirty();
      showToast('B2W loaded from SharePoint. Manual overrides remain available.');
    } catch (error) {
      state.b2wError = error && error.message || 'B2W SharePoint sync failed.';
      showToast(state.b2wError);
    } finally {
      state.b2wSyncing = false;
      render();
    }
  }

  async function saveManualB2wValue(date, rawValue) {
    var text = String(rawValue === undefined || rawValue === null ? '' : rawValue).trim();
    var deleting = text === '';
    var value = deleting ? null : Number(text);
    if (!deleting && (!Number.isInteger(value) || value < 0 || value > 1000000)) {
      showToast('Enter a whole B2W number from 0 to 1,000,000.');
      render();
      return;
    }
    var previous = { ...(state.manualB2wValues || {}) };
    var next = { ...previous };
    if (deleting) delete next[date]; else next[date] = value;
    state.manualB2wValues = next;
    state.b2wError = '';
    render();
    try {
      if (HOSTED_MODE) {
        var response = await fetch('/api/b2w', { method: 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ date: date, value: value }) });
        var payload = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(payload.error || 'B2W value could not be saved.');
        state.manualB2wValues = sanitizeB2wValues(payload.values);
        state.b2wSource = payload.source || state.b2wSource || 'Manual dashboard input';
        state.b2wUpdatedAt = payload.updatedAt || '';
        state.b2wSharePointSyncedAt = payload.sharePointSyncedAt || state.b2wSharePointSyncedAt;
      } else {
        writeLocalB2wValues(next);
        state.b2wSource = 'Browser saved input';
        state.b2wUpdatedAt = new Date().toISOString();
      }
      render();
      showToast(deleting ? 'B2W entry cleared.' : 'B2W saved and charts updated.');
    } catch (error) {
      state.manualB2wValues = previous;
      state.b2wError = error && error.message || 'B2W value could not be saved.';
      render();
      showToast(state.b2wError);
    }
  }

  function sanitizeRsaValues(values) {
    var clean = {}, fields = ['rsaJumpstart', 'rsaTyrePatch', 'rsaFuel'];
    Object.keys(values && typeof values === 'object' && !Array.isArray(values) ? values : {}).forEach(function(date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      var source = values[date], entry = {};
      fields.forEach(function(field) {
        var value = Number(source && source[field]);
        if (Number.isInteger(value) && value >= 0 && value <= 1000000) entry[field] = value;
      });
      if (Object.keys(entry).length) clean[date] = entry;
    });
    return clean;
  }

  function hasManualRsa(date, field) {
    return !!(state.manualRsaValues && state.manualRsaValues[date] && Object.prototype.hasOwnProperty.call(state.manualRsaValues[date], field));
  }

  function manualRsaValue(date, field) {
    return hasManualRsa(date, field) ? numberValue(state.manualRsaValues[date][field]) : NaN;
  }

  function readLocalRsaValues() {
    try { return sanitizeRsaValues(JSON.parse(window.localStorage.getItem(RSA_LOCAL_STORAGE_KEY) || '{}')); }
    catch (_) { return {}; }
  }

  function writeLocalRsaValues(values) {
    try { window.localStorage.setItem(RSA_LOCAL_STORAGE_KEY, JSON.stringify(values || {})); } catch (_) {}
  }

  async function loadManualRsaValues() {
    state.rsaLoading = true;
    state.rsaError = '';
    try {
      if (!HOSTED_MODE) state.manualRsaValues = readLocalRsaValues();
      else {
        var response = await fetch('/api/rsa-values', { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('RSA values could not be loaded.');
        var payload = await response.json();
        state.manualRsaValues = sanitizeRsaValues(payload && payload.values);
        state.manualRevisions.rsa = payload.revisions || {};
        state.rsaValuesUpdatedAt = payload && payload.updatedAt || '';
      }
      state.rsaApiAvailable = true;
    } catch (error) {
      state.rsaError = error && error.message || 'RSA values could not be loaded.';
    } finally {
      state.rsaLoading = false;
      state.manualSourcesReady.rsa = true;
      render();
    }
  }

  async function saveManualRsaValue(date, field, rawValue) {
    var text = String(rawValue === undefined || rawValue === null ? '' : rawValue).trim();
    var deleting = text === '', value = deleting ? null : Number(text);
    if (!deleting && (!Number.isInteger(value) || value < 0 || value > 1000000)) {
      showToast('Enter a whole RSA number from 0 to 1,000,000.'); render(); return;
    }
    var previous = JSON.parse(JSON.stringify(state.manualRsaValues || {}));
    var next = JSON.parse(JSON.stringify(previous));
    var entry = next[date] || {};
    if (deleting) delete entry[field]; else entry[field] = value;
    if (Object.keys(entry).length) next[date] = entry; else delete next[date];
    state.manualRsaValues = next;
    state.rsaError = '';
    render();
    try {
      if (HOSTED_MODE) {
        var response = await fetch('/api/rsa-values', { method: 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ date: date, field: field, value: value }) });
        var payload = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(payload.error || 'RSA value could not be saved.');
        state.manualRsaValues = sanitizeRsaValues(payload.values);
        state.rsaValuesUpdatedAt = payload.updatedAt || '';
      } else { writeLocalRsaValues(next); state.rsaValuesUpdatedAt = new Date().toISOString(); }
      render();
      showToast(deleting ? 'RSA entry cleared.' : 'RSA saved and charts updated.');
    } catch (error) {
      state.manualRsaValues = previous;
      state.rsaError = error && error.message || 'RSA value could not be saved.';
      render(); showToast(state.rsaError);
    }
  }

  function sanitizeManualReportValues(values) {
    var clean = {};
    Object.keys(values && typeof values === 'object' && !Array.isArray(values) ? values : {}).forEach(function(date) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && values[date] && typeof values[date] === 'object' && !Array.isArray(values[date])) clean[date] = values[date];
    });
    return clean;
  }

  function readLocalManualReport(key) {
    try { return sanitizeManualReportValues(JSON.parse(window.localStorage.getItem(key) || '{}')); }
    catch (_) { return {}; }
  }

  function writeLocalManualReport(key, values) {
    try { window.localStorage.setItem(key, JSON.stringify(values || {})); } catch (_) {}
  }

  async function loadManualReportValues(kind) {
    var isBGarage = kind === 'bgarage', stateKey = isBGarage ? 'manualBGarageSummaryValues' : 'manualIndonesiaSummaryValues';
    var updatedAtKey = isBGarage ? 'bgarageValuesUpdatedAt' : 'indonesiaValuesUpdatedAt';
    var errorKey = isBGarage ? 'bgarageValuesError' : 'indonesiaValuesError';
    var localKey = isBGarage ? BGARAGE_SUMMARY_LOCAL_STORAGE_KEY : INDONESIA_SUMMARY_LOCAL_STORAGE_KEY;
    var endpoint = isBGarage ? '/api/bgarage-summary-values' : '/api/indonesia-summary-values';
    state[errorKey] = '';
    try {
      if (!HOSTED_MODE) state[stateKey] = readLocalManualReport(localKey);
      else {
        var response = await fetch(endpoint, { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error((isBGarage ? 'BGarage' : 'Indonesia') + ' values could not be loaded.');
        var payload = await response.json();
        state[stateKey] = sanitizeManualReportValues(payload && payload.values);
        state.manualRevisions[kind] = payload.revisions || {};
        state[updatedAtKey] = payload && payload.updatedAt || '';
      }
    } catch (error) {
      state[errorKey] = error && error.message || 'Manual report values could not be loaded.';
      showToast(state[errorKey]);
    } finally { state.manualSourcesReady[isBGarage ? 'bgarage' : 'indonesia'] = true; render(); }
  }

  async function persistManualReportValue(kind, date, value) {
    var isBGarage = kind === 'bgarage', stateKey = isBGarage ? 'manualBGarageSummaryValues' : 'manualIndonesiaSummaryValues';
    var updatedAtKey = isBGarage ? 'bgarageValuesUpdatedAt' : 'indonesiaValuesUpdatedAt';
    var errorKey = isBGarage ? 'bgarageValuesError' : 'indonesiaValuesError';
    var savingKey = isBGarage ? 'bgarageSummarySaving' : 'indonesiaSummarySaving';
    var localKey = isBGarage ? BGARAGE_SUMMARY_LOCAL_STORAGE_KEY : INDONESIA_SUMMARY_LOCAL_STORAGE_KEY;
    var endpoint = isBGarage ? '/api/bgarage-summary-values' : '/api/indonesia-summary-values';
    var previous = JSON.parse(JSON.stringify(state[stateKey] || {})), next = JSON.parse(JSON.stringify(previous));
    next[date] = value;
    var savedDrafts = Object.assign({}, state.summaryDrafts), draft = Object.values(savedDrafts).find(function(d) { return d.kind === kind && d.date === date; });
    var expectedRevision = draft ? draft.revision : state.manualRevisions[kind][date] || 0;
    state[savingKey] = true;
    state[errorKey] = '';
    try {
      if (HOSTED_MODE) {
        var response = await fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ date: date, value: value, expectedRevision: expectedRevision }) });
        var payload = await response.json().catch(function() { return {}; });
        if (response.status === 409 && payload.current) await reviewManualConflict(kind, payload.current);
        if (!response.ok) throw new Error(payload.error || (isBGarage ? 'BGarage' : 'Indonesia') + ' values could not be saved.');
        acceptManualPayload(kind, payload);
      } else {
        state[stateKey] = next;
        writeLocalManualReport(localKey, next);
        state[updatedAtKey] = new Date().toISOString();
      }
      clearSavedDrafts(kind, date, savedDrafts);
      showToast((isBGarage ? 'BGarage' : 'Indonesia') + ' table saved' + (isBGarage ? ' and the main BGarage performance tab was updated for ' + formatSummaryDate(date) + '.' : ' and the main Indonesia tab was updated for ' + formatSummaryDate(date) + '.') + ' You can edit and save it again anytime.');
    } catch (error) {
      // Keep both the latest server record and the unsaved draft on failure.
      syncSummaryDirty();
      state[errorKey] = error && error.message || 'Values could not be saved.';
      showToast(state[errorKey]);
    } finally { state[savingKey] = false; render(); }
  }

  function acceptManualPayload(kind, payload) {
    var stateKeys = { b2w: 'manualB2wValues', rsa: 'manualRsaValues', bgarage: 'manualBGarageSummaryValues', indonesia: 'manualIndonesiaSummaryValues' };
    var timeKeys = { b2w: 'b2wUpdatedAt', rsa: 'rsaValuesUpdatedAt', bgarage: 'bgarageValuesUpdatedAt', indonesia: 'indonesiaValuesUpdatedAt' };
    state[stateKeys[kind]] = payload.values || {};
    state[timeKeys[kind]] = payload.updatedAt || '';
    state.manualRevisions[kind] = payload.revisions || {};
    if (kind === 'b2w') { state.b2wSource = payload.source || state.b2wSource; state.b2wSharePointSyncedAt = payload.sharePointSyncedAt || ''; state.b2wError = ''; }
    if (kind === 'rsa') state.rsaError = '';
  }

  async function reviewManualConflict(kind, current) {
    acceptManualPayload(kind, current);
    var changed = Object.values(state.summaryDrafts).filter(function(d) { return d.kind === kind && d.revision !== (current.revisions && current.revisions[d.recordKey] || 0); });
    if (!changed.length) return;
    var lines = changed.slice(0, 8).map(function(d) {
      var value = kind === 'rsa' ? current.values[d.date] && current.values[d.date][d.field] : current.values[d.date];
      return formatSummaryDate(d.date) + (d.field ? ' ' + d.field : '') + ': server now ' + (typeof value === 'object' ? 'has a revised report' : value === undefined ? 'blank' : value) + '; your draft is retained.';
    }).join(' ');
    if (await confirmSummaryOverwrite({ title: 'Another session changed ' + kind.toUpperCase(), confirmLabel: 'Review my draft', message: lines + ' Accept this newer revision as the baseline? Review your draft, then press Save again to overwrite.' })) {
      changed.forEach(function(d) { d.revision = current.revisions[d.recordKey] || 0; });
      persistSummaryDrafts();
    }
  }

  function parseManualServiceInput(rawValue, label) {
    var text = String(rawValue === undefined || rawValue === null ? '' : rawValue).trim();
    if (text === '') return null;
    var value = Number(text);
    if (!Number.isInteger(value) || value < 0 || value > 1000000) throw new Error('Enter a whole ' + label + ' number from 0 to 1,000,000.');
    return value;
  }

  function hasOwnValue(values, key) {
    return Object.prototype.hasOwnProperty.call(values || {}, key);
  }

  function manualReportHasSavedDate(kind, date) {
    var values = kind === 'bgarage' ? state.manualBGarageSummaryValues : state.manualIndonesiaSummaryValues;
    return hasOwnValue(values, date);
  }

  function manualServiceOverwriteDates(b2wUpdates, rsaUpdates, b2wValues, rsaValues) {
    var dates = {};
    b2wUpdates.forEach(function(update) {
      if (hasOwnValue(b2wValues, update.date)) dates[update.date] = true;
    });
    rsaUpdates.forEach(function(update) {
      if (hasOwnValue(rsaValues && rsaValues[update.date], update.field)) dates[update.date] = true;
    });
    return Object.keys(dates).sort();
  }

  function overwriteDateDescription(dates) {
    if (dates.length === 1) return 'for ' + formatSummaryDate(dates[0]);
    return 'for ' + dates.length + ' dates (' + formatSummaryDate(dates[0]) + ' to ' + formatSummaryDate(dates[dates.length - 1]) + ')';
  }

  async function saveManualServiceValues() {
    if (state.manualServiceSaving) return;
    captureSummaryDrafts();
    var savedDrafts = Object.assign({}, state.summaryDrafts), groups = { b2w: [], rsa: [] };
    try {
      Object.values(savedDrafts).forEach(function(draft) {
        if (!groups[draft.kind]) return;
        groups[draft.kind].push({ date: draft.date, field: draft.field, value: parseManualServiceInput(draft.value, draft.kind.toUpperCase()), expectedRevision: draft.revision });
      });
    } catch (error) { showToast(error.message); return; }
    if (!groups.b2w.length && !groups.rsa.length) { showToast('No RSA or B2W changes to save.'); return; }
    var overwriteDates = manualServiceOverwriteDates(groups.b2w, groups.rsa, state.manualB2wValues, state.manualRsaValues);
    if (overwriteDates.length && !await confirmSummaryOverwrite({
      title: 'Overwrite RSA & B2W data?',
      message: 'Replace only the edited values ' + overwriteDateDescription(overwriteDates) + '? Unchanged values will be kept.'
    })) return;
    state.manualServiceSaving = true;
    var failures = [], completed = [];
    try {
      for (var kind of Object.keys(groups)) {
        var updates = groups[kind];
        if (!updates.length) continue;
        try {
          var payload;
          if (HOSTED_MODE) {
            var response = await fetch(kind === 'b2w' ? '/api/b2w' : '/api/rsa-values', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ updates: updates }) });
            payload = await response.json();
            if (!response.ok) {
              if (response.status === 409 && payload.current) await reviewManualConflict(kind, payload.current);
              throw new Error(payload.error || kind.toUpperCase() + ' save failed.');
            }
          } else {
            var values = JSON.parse(JSON.stringify(kind === 'b2w' ? state.manualB2wValues : state.manualRsaValues));
            updates.forEach(function(update) {
              if (kind === 'b2w') { if (update.value === null) delete values[update.date]; else values[update.date] = update.value; }
              else { var row = values[update.date] || {}; if (update.value === null) delete row[update.field]; else row[update.field] = update.value; values[update.date] = row; }
            });
            payload = { values: values, updatedAt: new Date().toISOString() };
            if (kind === 'b2w') writeLocalB2wValues(values); else writeLocalRsaValues(values);
          }
          acceptManualPayload(kind, payload);
          clearSavedDrafts(kind, '', savedDrafts);
          completed.push(kind.toUpperCase());
        } catch (error) { failures.push(kind.toUpperCase() + ': ' + error.message); }
      }
      showToast((completed.length ? completed.join(' and ') + ' saved. ' : '') + (failures.length ? failures.join(' ') + ' Unsaved edits are retained.' : ''));
    } finally { state.manualServiceSaving = false; render(); }
  }

  function nullableNumberValue(value) {
    if (value === null || value === undefined) return null;
    var raw = String(value).trim();
    if (!raw || /^rm\s*-$/i.test(raw) || /^n\/?a$/i.test(raw) || raw === '-') return null;
    if (typeof value === 'number' && isFinite(value)) return value;
    var cleaned = raw.replace(/,/g, '').replace(/[^0-9.+-]/g, '');
    var parsed = cleaned && cleaned !== '-' && cleaned !== '+' && cleaned !== '.' ? Number(cleaned) : NaN;
    return isFinite(parsed) ? parsed : null;
  }

  function dateValue(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      // SheetJS Date cells are UTC-backed. Interpret them in the report's
      // Malaysia timezone so an Excel date such as 2026-08-01 is not rendered
      // as 2026-07-31 in browsers running on UTC.
      var date = value;
      var clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
      var hour = Number(clock.find(function(part) { return part.type === 'hour'; }).value);
      var minute = Number(clock.find(function(part) { return part.type === 'minute'; }).value);
      // Some Excel date-only cells arrive at 23:59:xx local time because of
      // the workbook timezone conversion. Nudge those values across midnight.
      if (hour === 23 && minute >= 55) date = new Date(date.getTime() + 60 * 1000);
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      var dateParts = {};
      parts.forEach(function(part) { dateParts[part.type] = part.value; });
      return dateParts.year + '-' + dateParts.month + '-' + dateParts.day;
    }
    if (typeof value === 'number') return new Date(Date.UTC(1899, 11, 30 + value)).toISOString().slice(0, 10);
    var raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    var slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (slash) return slash[3] + '-' + (slash[2].length === 1 ? '0' : '') + slash[2] + '-' + (slash[1].length === 1 ? '0' : '') + slash[1];
    var parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  }

  function parseSettings(rows) {
    var settings = { title: '', achieved: 100, near: 80, below: 60, pitstopAchieved: 100, pitstopNear: 90, timezone: 'Asia/Kuala_Lumpur', pitstopsAsOf: '' };
    (rows || []).forEach(function(row) {
      var name = cleanKey(cell(row, ['setting', 'name', 'key'], 0));
      var value = cell(row, ['value'], 1);
      if (name === 'reporttitle' || name === 'title') settings.title = String(value || '').trim();
      if (name === 'achievedthreshold' || name === 'bgarageachievedthreshold') settings.achieved = numberValue(value) || 100;
      if (name === 'neartargetthreshold' || name === 'nearthreshold' || name === 'bgarageneartargetthreshold') settings.near = numberValue(value) || 80;
      if (name === 'belowtargetthreshold' || name === 'belowthreshold' || name === 'bgaragebelowtargetthreshold') settings.below = numberValue(value) || 60;
      if (name === 'pitstopachievedthreshold') settings.pitstopAchieved = numberValue(value) || 100;
      if (name === 'pitstopyellowthreshold' || name === 'pitstopnearthreshold') settings.pitstopNear = numberValue(value) || 90;
      if (name === 'timezone') settings.timezone = String(value || settings.timezone);
      if (name === 'pitstopsasof' || name === 'pitstopasofdate') settings.pitstopsAsOf = dateValue(value);
    });
    return settings;
  }

  function performanceStatus(achievement, target, thresholds) {
    var rules = thresholds || { achieved: 100, near: 80, below: 60 };
    if (!(target > 0)) return 'na';
    return achievement >= rules.achieved ? 'achieved' : achievement >= rules.near ? 'near' : achievement >= rules.below ? 'below' : 'critical';
  }

  function pitstopStatusValue(sales, target) {
    sales = numberValue(sales);
    target = numberValue(target);
    if (!(target > 0)) return 'red';
    if (sales >= target) return 'green';
    return target - sales <= 1 || sales * 10 >= target * 9 ? 'yellow' : 'red';
  }

  function normalizePayload(raw, sourceName) {
    var payload = raw && raw.data && typeof raw.data === 'object' ? raw.data : (raw || {});
    var rows = [], dataIssues = Array.isArray(payload.dataIssues) ? payload.dataIssues.slice() : [], settings = parseSettings(payload.settings || []);
    if (payload.thresholds) {
      settings.achieved = numberValue(payload.thresholds.achieved) || settings.achieved;
      settings.near = numberValue(payload.thresholds.near) || settings.near;
      settings.below = numberValue(payload.thresholds.below) || settings.below;
    }
    if (payload.pitstopThresholds) {
      settings.pitstopAchieved = numberValue(payload.pitstopThresholds.achieved) || settings.pitstopAchieved;
      settings.pitstopNear = numberValue(payload.pitstopThresholds.near) || settings.pitstopNear;
    }
    if (payload.timezone) settings.timezone = String(payload.timezone);
    if (payload.pitstopsAsOf) settings.pitstopsAsOf = dateValue(payload.pitstopsAsOf);
    if (payload.dayDates && payload.sales) {
      rows = payload.dayDates.map(function(date, index) {
        var sales = payload.sales[index] || [];
        var rsa = (payload.rsa || [])[index] || [];
        var resq = (payload.resq || [])[index] || [];
        var warranty = (payload.warranty || [])[index] || [];
        return { date: date, b2c: sales[0] || 0, b2b2c: sales[1] || 0, hq: sales[0] || 0, bp: sales[1] || 0, wh: 0, whAvailable: false, 'RSA Jumpstart': rsa[0] || 0, 'RSA Tyre Patch': rsa[1] || 0, 'RSA Fuel': rsa[2] || 0, B2W: rsa[3] || 0, 'ResQ Selangor': resq[0] || 0, 'ResQ JB': resq[1] || 0, 'ResQ Pahang': resq[2] || 0, 'ResQ Penang': resq[3] || 0, 'Warranty 1st': warranty[0] || 0, 'Warranty 2nd': warranty[1] || 0, 'Warranty 3rd': warranty[2] || 0 };
      });
    } else {
      var serviceRows = payload.serviceWarranty || payload.services || [];
      var datedServices = serviceRows.filter(function(row) { return !!dateValue(cell(row, ['date', 'day', 'report date'], 0)); });
      if (datedServices.length) {
        var servicesByDate = {}, dailyByDate = {}, serviceDuplicates = 0, missingServiceDates = 0;
        datedServices.forEach(function(row) {
          var key = dateValue(cell(row, ['date', 'day', 'report date'], 0));
          if (servicesByDate[key]) serviceDuplicates += 1;
          servicesByDate[key] = row;
        });
        (payload.dailySales || []).forEach(function(row) {
          var key = dateValue(cell(row, ['date', 'day', 'report date'], 0));
          if (key) dailyByDate[key] = row;
        });
        rows = Array.from(new Set(Object.keys(servicesByDate).concat(Object.keys(dailyByDate)))).sort().map(function(key) {
          var serviceRow = servicesByDate[key], dailyRow = dailyByDate[key];
          if (dailyRow && !serviceRow) missingServiceDates += 1;
          return Object.assign({}, serviceRow || {}, dailyRow || {}, { Date: key });
        });
        if (serviceDuplicates) dataIssues.push(serviceDuplicates + ' duplicate Service & Warranty date row(s) were found; the last row for each date was used.');
        if (missingServiceDates) dataIssues.push(missingServiceDates + ' Daily Sales date(s) have no matching Service & Warranty row.');
      } else {
        rows = (payload.dailySales || []).map(function(row, index) {
          var serviceRow = serviceRows[index];
          return serviceRow ? Object.assign({}, serviceRow, row) : row;
        });
        if (serviceRows.length) dataIssues.push('Service & Warranty has no Date column, so rows were matched to Daily Sales by row order. Add Date for a reliable join.');
      }
    }

    var invalidDailyDates = 0;
    var dailySales = rows.filter(hasNonDateValue).map(function(row) {
      var rawHq = optionalCell(row, ['hq', 'hq units', 'hq sales', 'b2c hq', 'b2c hq units']);
      var rawBp = optionalCell(row, ['bp', 'bp units', 'bp sales', 'b2b2c bp', 'b2b2c bp units']);
      var rawWh = optionalCell(row, ['wh', 'wh units', 'wh sales', 'warehouse', 'warehouse units', 'b2c wh', 'b2c wh units']);
      var b2c = rawHq === undefined ? numberValue(cell(row, ['b2c', 'b2c sales'], 1)) : numberValue(rawHq);
      var b2b2c = rawBp === undefined ? numberValue(cell(row, ['b2b2c', 'b2b c', 'b2b2c sales'], 2)) : numberValue(rawBp);
      var hasWh = row.whAvailable === false ? false : rawWh !== undefined;
      var normalizedDate = dateValue(cell(row, ['date', 'day', 'report date'], 0));
      if (!normalizedDate) invalidDailyDates += 1;
      return {
        date: normalizedDate,
        b2c: b2c,
        b2b2c: b2b2c,
        hq: rawHq === undefined ? b2c : numberValue(rawHq),
        bp: rawBp === undefined ? b2b2c : numberValue(rawBp),
        wh: hasWh ? numberValue(rawWh) : 0,
        whAvailable: hasWh,
        rsaJumpstart: numberValue(cell(row, ['rsa jumpstart', 'jumpstart'], 3)),
        rsaTyrePatch: numberValue(cell(row, ['rsa tyre patch', 'rsa tire patch', 'tyre patch'], 4)),
        rsaFuel: numberValue(cell(row, ['rsa fuel', 'fuel'], 5)),
        b2w: numberValue(cell(row, ['b2w'], 6)),
        resQSelangor: numberValue(cell(row, ['resq selangor', 'resq sel'], 7)),
        resQJb: numberValue(cell(row, ['resq jb', 'resq johor bahru'], 8)),
        resQPahang: numberValue(cell(row, ['resq pahang'], 9)),
        resQPenang: numberValue(cell(row, ['resq penang'], 10)),
        warranty1st: numberValue(cell(row, ['warranty 1st', 'warranty first', '1st warranty'], 11)),
        warranty2nd: numberValue(cell(row, ['warranty 2nd', 'warranty second', '2nd warranty'], 12)),
        warranty3rd: numberValue(cell(row, ['warranty 3rd', 'warranty third', '3rd warranty'], 13))
      };
    }).filter(function(row) { return !!row.date; }).sort(function(a, b) { return a.date.localeCompare(b.date); });
    if (invalidDailyDates) dataIssues.push(invalidDailyDates + ' Daily Sales row(s) were ignored because the date is missing or invalid.');
    var dailyDateCounts = {};
    dailySales.forEach(function(row) { dailyDateCounts[row.date] = (dailyDateCounts[row.date] || 0) + 1; });
    var duplicateDailyDates = Object.keys(dailyDateCounts).filter(function(date) { return dailyDateCounts[date] > 1; });
    if (duplicateDailyDates.length) dataIssues.push('Duplicate Daily Sales dates: ' + duplicateDailyDates.join(', ') + '.');

    var masterRows = payload.pitstopMaster || payload.masterPitstops || [];
    var masterByName = {}, duplicateMasterNames = 0, masterMissingTier = 0;
    var pitstopMaster = masterRows.map(function(row) {
      var id = String(cell(row, ['no_id', 'no id', 'id'], 0) || '').trim();
      var idType = id.toUpperCase();
      var name = String(cell(row, ['branch', 'pitstop', 'name'], 1) || '').trim();
      // Pitstop Master is authoritative except for reviewed reporting
      // corrections. Grafana continues to contribute sales values only.
      var stateName = reportedPitstopState(name, cell(row, ['state'], 2));
      var tier = canonicalTier(cell(row, ['tier'], 4));
      var status = String(cell(row, ['branch_status', 'branch status', 'status'], 5) || '').trim().toLowerCase();
      var country = String(cell(row, ['country'], 8) || '').trim();
      var sourceType = canonicalChannel(cell(row, ['type', 'channel'], 3) || (/^BP\b/i.test(name) ? 'BP' : 'HQ'));
      var closedChannel = idType === 'BPC' ? 'BPC' : idType === 'HQC' ? 'HQC' : '';
      if (!tier) masterMissingTier += 1;
      return {
        id: id,
        name: name,
        state: stateName,
        region: regionForState(stateName),
        channel: closedChannel || (/^WH\b/i.test(name) ? 'WH' : sourceType),
        type: sourceType,
        tier: tier,
        target: targetForTier(tier),
        branchStatus: status,
        active: status === 'active',
        closed: !!closedChannel,
        country: country,
        malaysia: isMalaysiaCountry(country),
        city: String(cell(row, ['city'], 6) || '').trim(),
        zone: String(cell(row, ['zone'], 7) || '').trim(),
        dateLive: dateValue(cell(row, ['date_live', 'date live', 'live date'], 9)),
        latitude: nullableNumberValue(cell(row, ['latitude', 'lat'], 10)),
        longitude: nullableNumberValue(cell(row, ['longitude', 'lng', 'lon'], 11))
      };
    }).filter(function(row) { return !!row.name; });
    pitstopMaster.forEach(function(row) { pitstopMatchKeys(row.name).forEach(function(key) { if (masterByName[key] && masterByName[key] !== row) duplicateMasterNames += 1; masterByName[key] = row; }); });
    var relocationRows = (payload.pitstopRelocations || payload.relocations || []).map(normalizePitstopRelocation).filter(Boolean);
    masterRows.map(normalizePitstopRelocation).filter(Boolean).forEach(function(row) { relocationRows.push(row); });
    DEFAULT_PITSTOP_RELOCATIONS.forEach(function(row) { relocationRows.push(row); });
    var relocationByFrom = {};
    relocationRows.forEach(function(row) {
      var fromKey = canonicalPitstopKey(row.from), destination = null;
      pitstopMatchKeys(row.to).some(function(key) { if (masterByName[key] && masterByName[key].active && masterByName[key].malaysia) { destination = masterByName[key]; return true; } return false; });
      if (!fromKey || !destination) return;
      relocationByFrom[fromKey] = { from: row.from, to: destination.name, relocationDate: row.relocationDate || '', destinationId: destination.id };
      pitstopMatchKeys(row.from).forEach(function(key) { masterByName[key] = destination; });
    });
    var pitstopRelocations = Object.keys(relocationByFrom).map(function(key) { return relocationByFrom[key]; });
    if (duplicateMasterNames) dataIssues.push(duplicateMasterNames + ' duplicate Pitstop Master branch name(s) were found; the last row was used.');
    if (masterMissingTier) dataIssues.push(masterMissingTier + ' Pitstop Master row(s) have no Tier and therefore have no calculated target.');

    var pitRows = payload.pitstops || payload.pit || [];
    var pitstopStatusMismatches = 0, pitstopMissingTargets = 0, pitstopDate = '', inactiveMasterMatches = 0, unmatchedMasterNames = {};
    var pitstops = pitRows.map(function(row) {
      // Some daily workbooks place one Date cell beside the pitstop table
      // instead of repeating it on every row. Carry that date down until the
      // next non-empty date so all pitstops participate in period filtering.
      var explicitDate = dateValue(cell(row, ['date', 'day', 'report date'], 0));
      if (explicitDate) pitstopDate = explicitDate;
      var normalizedPitDate = explicitDate || pitstopDate;
      var name = String(cell(row, ['name', 'pitstop', 'location'], 1) || 'Unnamed pitstop').trim();
      var uploadedState = reportedPitstopState(name, cell(row, ['state'], 3));
      var uploadedRegion = String(cell(row, ['region'], 2) || regionForState(uploadedState) || 'Unassigned');
      var master = null;
      pitstopMatchKeys(name).some(function(key) { if (masterByName[key]) { master = masterByName[key]; return true; } return false; });
      if (master && ((!master.active && !master.closed) || !master.malaysia)) { inactiveMasterMatches += 1; return null; }
      if (pitstopMaster.length && !master) unmatchedMasterNames[canonicalPitstopKey(name)] = name;
      var uploadedTier = canonicalTier(cell(row, ['tier'], 4)) || 'Tier 1';
      var tier = master ? master.tier : uploadedTier;
      var uploadedTarget = numberValue(cell(row, ['target', 'daily target'], 5));
      var target = master ? master.target : uploadedTarget;
      var sales = numberValue(cell(row, ['sales', 'actual'], 6));
      var achievement = target ? Math.round(sales / target * 100) : 0;
      var calculatedStatus = pitstopStatusValue(sales, target);
      var uploadedStatus = String(cell(row, ['status'], 7) || '').trim().toLowerCase();
      if (uploadedStatus && ['green', 'yellow', 'red'].indexOf(uploadedStatus) !== -1 && uploadedStatus !== calculatedStatus) pitstopStatusMismatches += 1;
      if (!(target > 0)) pitstopMissingTargets += 1;
      return { date: normalizedPitDate, channel: master ? master.channel : (/^WH\b/i.test(name) ? 'WH' : canonicalChannel(cell(row, ['channel', 'type'], 0) || 'HQ')), name: master ? master.name : name, region: master ? master.region : uploadedRegion, state: master ? master.state : uploadedState, tier: tier, target: target, sales: sales, status: calculatedStatus, achievement: achievement, variance: sales - target, masterId: master ? master.id : '', masterMatched: !!master };
    }).filter(function(row) { return !!row && !!row.name; });
    if (pitstopStatusMismatches) dataIssues.push(pitstopStatusMismatches + ' uploaded Pitstop status value(s) differed from the calculated threshold status; calculated values are shown.');
    if (pitstopMissingTargets) dataIssues.push(pitstopMissingTargets + ' Pitstop row(s) have no valid target and are treated as needing attention.');
    if (inactiveMasterMatches) dataIssues.push(inactiveMasterMatches + ' dated Pitstop row(s) matched inactive or non-Malaysia master branches and were excluded.');
    var unmatchedMasterCount = Object.keys(unmatchedMasterNames).length;
    if (unmatchedMasterCount) dataIssues.push(unmatchedMasterCount + ' Pitstop name(s) did not match Pitstop Master; their uploaded metadata is still shown.');

    var bgarageRows = payload.bgarage || payload.bGarage || [];
    var bgarage = bgarageRows.map(function(row) {
      var dailyTarget = nullableNumberValue(cell(row, ['daily sales target', 'daily target', 'daily sales target rm', 'dailyTarget'], 2));
      var dailyActual = nullableNumberValue(cell(row, ['daily actual sales', 'daily sales', 'daily actual sales rm', 'dailyActual'], 3));
      var mtdActual = nullableNumberValue(cell(row, ['mtd actual sales rm', 'mtd actual sales', 'mtd sales', 'mtdActual'], 4));
      var monthlyTarget = nullableNumberValue(cell(row, ['monthly target', 'monthly sales target', 'monthlyTarget'], 5));
      var intakeActual = nullableNumberValue(cell(row, ['daily intake actual', 'intake actual', 'intakeActual'], 9));
      var intakeTarget = nullableNumberValue(cell(row, ['daily intake target', 'intake target', 'intakeTarget'], 10));
      return {
        date: dateValue(cell(row, ['date', 'report date'], 0)),
        outlet: String(cell(row, ['outlet', 'bgarage outlet', 'location'], 1) || 'Unnamed outlet'),
        dailyTarget: dailyTarget,
        dailyActual: dailyActual,
        dailyAchievement: dailyTarget > 0 && dailyActual !== null ? Math.round(dailyActual / dailyTarget * 100) : null,
        mtdActual: mtdActual,
        monthlyTarget: monthlyTarget,
        mtdAchievement: monthlyTarget > 0 && mtdActual !== null ? Math.round(mtdActual / monthlyTarget * 100) : null,
        shortfall: mtdActual !== null && monthlyTarget !== null ? mtdActual - monthlyTarget : null,
        referrals: numberValue(cell(row, ['special cases referred', 'referrals'], 6)),
        conversions: numberValue(cell(row, ['successful conversions', 'conversions'], 7)),
        pickDrop: numberValue(cell(row, ['pick and drop cases', 'pick drop cases', 'pick & drop cases'], 8)),
        intakeActual: intakeActual,
        intakeTarget: intakeTarget,
        intakeAchievement: intakeTarget > 0 && intakeActual !== null ? Math.round(intakeActual / intakeTarget * 100) : null
      };
    }).filter(function(row) { return !!row.outlet; }).sort(function(a, b) { return a.date.localeCompare(b.date) || a.outlet.localeCompare(b.outlet); });
    var invalidBGarageDates = bgarage.filter(function(row) { return !row.date; }).length;
    if (invalidBGarageDates) dataIssues.push(invalidBGarageDates + ' BGarage row(s) have no valid date and will not appear in a selected date range.');
    var bgarageKeys = {}, duplicateBGarage = 0;
    bgarage.forEach(function(row) { var key = row.date + '::' + row.outlet.toUpperCase(); if (bgarageKeys[key]) duplicateBGarage += 1; bgarageKeys[key] = true; });
    if (duplicateBGarage) dataIssues.push(duplicateBGarage + ' duplicate BGarage Date + Outlet row(s) were found.');

    var indonesiaRows = payload.indonesia || payload.indonesiaSales || payload.baterikuIndonesia || [];
    var indonesia = indonesiaRows.map(function(row) {
      return {
        date: dateValue(cell(row, ['date', 'tanggal', 'tarikh', 'report date'], 0)),
        pitstop: String(cell(row, ['pitstop', 'pit stop', 'location', 'outlet'], 1) || 'Unnamed pitstop').trim(),
        totalLead: numberValue(cell(row, ['total lead', 'total leads', 'leads'], 2)),
        pendingLead: numberValue(cell(row, ['pending lead', 'pending leads'], 3)),
        cancelledLead: numberValue(cell(row, ['cancelled lead', 'canceled lead', 'cancelled leads', 'cancelled'], 4)),
        baterikuJumpstart: numberValue(cell(row, ['bateriku jumpstart', 'bateriku sales jumpstart', 'bateriku jumpstart sales'], 5)),
        baterikuCharge: numberValue(cell(row, ['bateriku charge', 'bateriku sales charge'], 6)),
        baterikuWarranty: numberValue(cell(row, ['bateriku warranty', 'bateriku sales warranty'], 7)),
        baterikuBattery: numberValue(cell(row, ['bateriku battery', 'bateriku sales battery', 'bateriku battery sales'], 8)),
        partnerJumpstart: numberValue(cell(row, ['partner jumpstart', 'partner sales jumpstart', 'partner jumpstart sales'], 9)),
        partnerBattery: numberValue(cell(row, ['partner battery', 'partner sales battery', 'partner battery sales'], 10))
      };
    }).filter(function(row) { return !!row.date && !!row.pitstop; }).sort(function(a, b) { return a.date.localeCompare(b.date) || a.pitstop.localeCompare(b.pitstop); });
    var invalidIndonesiaDates = indonesiaRows.length - indonesia.length;
    if (invalidIndonesiaDates) dataIssues.push(invalidIndonesiaDates + ' Indonesia row(s) were ignored because Date or Pitstop is missing.');

    var latestDailyDate = dailySales.length ? dailySales[dailySales.length - 1].date : '', latestPitstopDate = pitstops.reduce(function(latest, row) { return row.date > latest ? row.date : latest; }, '');
    return { title: String(settings.title || payload.title || payload.reportTitle || 'Daily Report Dashboard'), benchmark: null, thresholds: { achieved: settings.achieved, near: settings.near, below: settings.below }, pitstopThresholds: { achieved: settings.pitstopAchieved, near: settings.pitstopNear, below: 0 }, timezone: settings.timezone, pitstopsAsOf: settings.pitstopsAsOf || latestPitstopDate || latestDailyDate, dataIssues: dataIssues, dailySales: dailySales, pitstops: pitstops, pitstopMaster: pitstopMaster, pitstopRelocations: pitstopRelocations, bgarage: bgarage, indonesia: indonesia, sourceName: String(payload.sourceName || sourceName || 'SharePoint data file'), pitstopMasterSourceName: String(payload.pitstopMasterSourceName || ''), loadedAt: String(payload.loadedAt || payload.generatedAt || '') };
  }

  function formatNumber(value) { return Number.isNaN(value) ? 'N/A' : numberFormatter.format(Math.round(value || 0)); }
  function formatCompact(value) { return Math.abs(value) >= 1000 ? (value / 1000).toFixed(value >= 10000 ? 0 : 1) + 'k' : formatNumber(value); }
  function localDateToday() { var now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function shiftIsoDate(iso, days) {
    var date = new Date(String(iso || '') + 'T00:00:00Z');
    if (isNaN(date.getTime())) return '';
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  function defaultPitstopSyncWindow() {
    var to = shiftIsoDate(localDateToday(), -1);
    return { from: shiftIsoDate(to, -30), to: to };
  }
  function formatDate(iso, withYear) {
    if (!iso) return 'No date';
    var match = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[3] + '/' + match[2] + '/' + match[1] : String(iso);
  }
  function formatSummaryDate(iso) {
    if (!iso) return 'No date';
    var match = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[3] + '.' + match[2] + '.' + match[1] : String(iso);
  }
  function formatRange(from, to) { return !from || !to ? 'No reporting dates' : from === to ? formatDate(from, true) : formatDate(from) + ' - ' + formatDate(to); }
  function percentage(value, denominator) { return denominator ? Math.round(value / denominator * 100) : 0; }
  function escapeHtml(value) { return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function(character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }
  function serviceValue(row, key) { return key === 'resQ' ? row.resQSelangor + row.resQJb + row.resQPahang + row.resQPenang : numberValue(row[key]); }
  function totalServices(row) { return row.rsaJumpstart + row.rsaTyrePatch + row.rsaFuel + row.b2w + row.resQSelangor + row.resQJb + row.resQPahang + row.resQPenang; }
  function totalWarranty(row) { return row.warranty1st + row.warranty2nd + row.warranty3rd; }
  function totalSales(row) { return row.b2c + row.b2b2c; }
  function dailyDetailLabel(channel) { return channel === 'all' ? 'All' : channel === 'bp' ? 'BP' : channel === 'wh' ? 'WH' : 'HQ'; }
  function dailyDetailValue(row, channel) { return channel === 'bp' ? numberValue(row.bp !== undefined ? row.bp : row.b2b2c) : channel === 'wh' ? numberValue(row.wh) : numberValue(row.hq !== undefined ? row.hq : row.b2c); }
  function salesTotalForChannel(row, channel) { return channel === 'hq' ? numberValue(row.b2c) : channel === 'bp' ? numberValue(row.b2b2c) : numberValue(row.total !== undefined ? row.total : totalSales(row)); }
  function statusLabel(status) { return status === 'green' ? 'On track' : status === 'yellow' ? 'Watch' : 'Action'; }
  function statusClass(status) { return status === 'green' ? 'green' : status === 'yellow' ? 'yellow' : 'red'; }
  function channelLabel(channel) { var value = String(channel || '').toUpperCase(); return value === 'B2C' ? 'HQ' : value === 'B2B2C' ? 'BP' : value === 'HQC' ? 'HQ Closed' : value === 'BPC' ? 'BP Closed' : String(channel || ''); }
  function channelClass(channel) { return 'channel-' + String(channel || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function performanceLabel(status) { return status === 'achieved' ? 'Achieved' : status === 'near' ? 'Near target' : status === 'below' ? 'Below target' : status === 'critical' ? 'Critical' : 'N/A'; }
  function formatMoney(value) {
    var amount = Number(value || 0);
    var label = (amount < 0 ? '-RM' : 'RM') + Math.abs(amount).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '<span class="money-value">' + label + '</span>';
  }
  function formatMoneyText(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'RM -';
    var amount = Number(value);
    return (amount < 0 ? '-RM' : 'RM') + Math.abs(amount).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function formatMoneyInputValue(value) {
    var amount = Number(String(value === null || value === undefined ? '' : value).replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount < 0) amount = 0;
    return amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function manualBGarageShortfall(mtdActual, monthlyTarget) {
    var target = numberValue(monthlyTarget);
    return target > 0 ? numberValue(mtdActual) - target : null;
  }
  function formatBGarageMoney(value) {
    return value === null || value === undefined ? '<span class="money-value is-na">RM -</span>' : formatMoney(value);
  }

  function formatAchievement(value) { return value === null || value === undefined ? 'N/A' : value + '%'; }

  function readStored() {
    try { var value = localStorage.getItem(STORAGE_KEY); return value ? JSON.parse(value) : null; } catch (error) { return null; }
  }

  function readSharedWorkbook() {
    try { var value = localStorage.getItem(SHARED_WORKBOOK_KEY); return value ? JSON.parse(value) : null; } catch (error) { return null; }
  }

  function clearSharedWorkbook() {
    try { localStorage.removeItem(SHARED_WORKBOOK_KEY); } catch (error) { /* file:// storage may be disabled */ }
  }

  function applyWorkbookPayload(payload, sourceName, toastMessage) {
    state.data = normalizePayload(payload, sourceName || 'Data Upload Centre upload');
    state.sourceName = state.data.sourceName;
    state.grafanaPitstopSalesByKey = null;
    state.weekendPitstopSalesByKey = null;
    state.weekendPitstopSyncKey = '';
    state.weekendSalesSyncKey = '';
    resetSummaryNetworkSales();
    state.grafanaPitstopChannelTotals = null;
    state.pitstopTotalsSyncRange = '';
    state.pitstopSyncRange = '';
    applyRangePreset('month');
    state.selectedKey = '';
    saveStored(state.data);
    render();
    updateUploadCentre();
    // Workbook uploads replace Pitstop Master, so refresh the live Grafana
    // performance overlay against the new master immediately.  Without this
    // step the detail table renders the workbook's placeholder sales (often
    // zero) until the user changes the date filter or refreshes the page.
    scheduleHostedWorkbookSync();
    if (toastMessage) showToast(toastMessage);
  }

  function scheduleHostedWorkbookSync() {
    if (!HOSTED_MODE || !state.from || !state.to) return;
    window.clearTimeout(scheduleHostedWorkbookSync.timer);
    scheduleHostedWorkbookSync.timer = window.setTimeout(async function() {
      var rangeKey = state.from + '::' + state.to;
      if (state.pitstopSyncRange === rangeKey && state.emailSalesSyncRange === rangeKey) return;
      setProgress(true);
      try {
        var results = await Promise.allSettled([
          syncHostedPitstopPerformance(state.from, state.to),
          syncHostedEmailSales(state.from, state.to)
        ]);
        var pitstopError = results[0].status === 'rejected' ? results[0].reason : null;
        if (pitstopError && pitstopError.name !== 'AbortError') {
          state.grafanaPitstopError = pitstopError && pitstopError.message || 'Grafana pitstop performance could not be loaded.';
          showNotice('Live pitstop sales could not refresh. Workbook metadata remains available; use Refresh to try again.');
        }
        render();
      } finally {
        setProgress(false);
      }
    }, 40);
  }

  function saveStored(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (error) { /* file:// storage may be disabled */ }
  }

  function grafanaDateRange(from, to) {
    var dates = [], cursor = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
    if (isNaN(cursor.getTime()) || isNaN(end.getTime()) || cursor > end) return dates;
    while (cursor <= end && dates.length < 730) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
    return dates;
  }

  function mergeGrafanaPitstopSales(payload) {
    var mapped = mappedGrafanaPitstops(payload), rangeKey = payload.from + '::' + payload.to;
    state.grafanaPitstopChannelTotals = payload.channelTotals || null;
    state.grafanaPitstopSalesByKey = mapped.map;
    state.pitstopTotalsSyncRange = rangeKey;
    state.data.pitstops = mapped.rows;
    state.grafanaPitstopLastSync = payload.generatedAt || '';
    state.grafanaPitstopSource = payload.source || 'Grafana HQ/BP performance panels';
  }

  // Build a sales overlay without replacing the currently selected Pitstop
  // Explorer range. Weekend Average needs a separate Fri-Sun Grafana query,
  // while the normal explorer can remain on any report window.
  function mappedGrafanaPitstops(payload) {
    var masters = (state.data.pitstopMaster || []).filter(function(row) { return row.malaysia && (row.active || row.closed); });
    var rows = {}, map = {}, excluded = [], days = grafanaDateRange(payload.from, payload.to).length;
    function rowKey(master) { return canonicalChannel(master.channel) + '::' + canonicalPitstopKey(master.name); }
    function add(master) {
      var key = rowKey(master);
      if (!rows[key]) rows[key] = Object.assign({}, master, { date: payload.to, sales: 0, target: targetForTier(master.tier) * days, masterMatched: true });
      return rows[key];
    }
    masters.filter(function(master) { return master.active; }).forEach(add);
    (payload.pitstops || []).forEach(function(source) {
      if (source.date < payload.from || source.date > payload.to) return;
      var name = source.pitstop || source.name || '', sourceKey = canonicalPitstopKey(name);
      var relocation = (state.data.pitstopRelocations || []).find(function(item) { return canonicalPitstopKey(item.from) === sourceKey; });
      var searchName = relocation ? relocation.to : name;
      var matches = masters.filter(function(master) { return canonicalPitstopKey(master.name) === canonicalPitstopKey(searchName); });
      if (!matches.length) {
        var aliases = pitstopMatchKeys(searchName);
        matches = masters.filter(function(master) { return pitstopMatchKeys(master.name).some(function(alias) { return aliases.indexOf(alias) !== -1; }); });
      }
      var channel = canonicalChannel(source.channel);
      matches = matches.filter(function(master) { var c = canonicalChannel(master.channel); return channel === 'BP' ? c === 'BP' || c === 'BPC' : c === 'HQ' || c === 'WH' || c === 'HQC'; });
      if (matches.length !== 1) { excluded.push({ name: name, sales: numberValue(source.sales), reason: matches.length ? 'ambiguous Master name' : 'not in Malaysia Pitstop Master' }); return; }
      var row = add(matches[0]);
      row.sales += numberValue(source.sales);
    });
    Object.values(rows).forEach(function(row) {
      row.achievement = row.target ? Math.round(row.sales / row.target * 100) : 0;
      row.variance = row.sales - row.target;
      row.status = pitstopStatusValue(row.sales, row.target);
      map[rowKey(row)] = row.sales;
    });
    var rawSales = (payload.pitstops || []).reduce(function(sum, row) { return sum + numberValue(row.sales); }, 0);
    var activeSales = Object.values(rows).filter(function(row) { return row.active; }).reduce(function(sum, row) { return sum + row.sales; }, 0);
    var closedSales = Object.values(rows).filter(function(row) { return !row.active; }).reduce(function(sum, row) { return sum + row.sales; }, 0);
    state.pitstopReconciliation[payload.from + '::' + payload.to] = { rawSales: rawSales, activeSales: activeSales, closedSales: closedSales, excluded: excluded };
    return { rows: Object.values(rows), map: map };
  }

  function grafanaPitstopSalesMap(payload) {
    return mappedGrafanaPitstops(payload).map;
  }

  async function loadPitstopHistoryManifest() {
    if (!HOSTED_MODE) return null;
    var response = await fetch('/api/pitstop-history', { cache: 'no-store', credentials: 'same-origin' });
    if (response.status === 404) { state.pitstopHistoryManifest = null; return null; }
    if (!response.ok) throw new Error('Historical archive HTTP ' + response.status);
    state.pitstopHistoryManifest = await response.json();
    return state.pitstopHistoryManifest;
  }

  function waitForRetry(delay, signal) {
    return new Promise(function(resolve, reject) {
      if (signal && signal.aborted) {
        var aborted = new Error('Request cancelled.');
        aborted.name = 'AbortError';
        reject(aborted);
        return;
      }
      var timer = window.setTimeout(resolve, delay);
      if (signal) signal.addEventListener('abort', function() {
        window.clearTimeout(timer);
        var aborted = new Error('Request cancelled.');
        aborted.name = 'AbortError';
        reject(aborted);
      }, { once: true });
    });
  }

  async function fetchPitstopPerformance(from, to, signal) {
    var rangeKey = from + '::' + to;
    var url = '/api/pitstop-performance?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + refreshQuerySuffix();
    var response, result, attempt = 0;
    try {
      while (attempt < 3) {
        response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: signal });
        result = await response.json().catch(function() { return {}; });
        if (response.ok) return rememberSuccessfulSourceSnapshot('pitstop', rangeKey, result);
        attempt += 1;
        if ([502, 503, 504].indexOf(response.status) === -1 || attempt >= 3) {
          var error = new Error(result.error || ('Pitstop sales service HTTP ' + response.status));
          error.status = response.status;
          throw error;
        }
        await waitForRetry(300 * attempt, signal);
      }
    } catch (error) {
      var fallback = recoverSuccessfulSourceSnapshot('pitstop', rangeKey, error);
      if (fallback) return fallback;
      throw error;
    }
  }

  async function syncHostedPitstopPerformance(requestedFrom, requestedTo) {
    var from = requestedFrom || firstDate(), to = requestedTo || lastDate();
    if (!from || !to) {
      var fallbackWindow = defaultPitstopSyncWindow();
      from = fallbackWindow.from;
      to = fallbackWindow.to;
    }
    if (!from || !to) return;
    var rangeKey = from + '::' + to;
    if (state.pitstopSyncRange === rangeKey) return;
    var cached = pitstopResponseCache[rangeKey];
    var payload;
    if (!state.forceDataRefresh && cached && Date.now() - cached.savedAt < PITSTOP_BROWSER_CACHE_MS) {
      payload = cached.payload;
    } else {
      if (activePitstopRequest && activePitstopRequest.key !== rangeKey) activePitstopRequest.controller.abort();
      if (!activePitstopRequest || activePitstopRequest.key !== rangeKey) {
        var controller = new AbortController();
        var promise = fetchPitstopPerformance(from, to, controller.signal);
        activePitstopRequest = { key: rangeKey, controller: controller, promise: promise };
      }
      var request = activePitstopRequest;
      try { payload = await request.promise; }
      finally { if (activePitstopRequest === request) activePitstopRequest = null; }
      pitstopResponseCache[rangeKey] = { savedAt: Date.now(), payload: payload };
      var cacheKeys = Object.keys(pitstopResponseCache).sort(function(left, right) { return pitstopResponseCache[right].savedAt - pitstopResponseCache[left].savedAt; });
      cacheKeys.slice(6).forEach(function(key) { delete pitstopResponseCache[key]; });
    }
    // A slower response for an older range must never overwrite the range the
    // user is currently viewing.  This is especially easy to hit when moving
    // from 14 days to Whole month or a manual calendar window.
    if (selectedRangeKey() !== rangeKey) return;
    mergeGrafanaPitstopSales(payload);
    state.pitstopSyncRange = rangeKey;
    state.grafanaPitstopError = '';
  }

  async function syncPitstopRangeAfterFilter() {
    if (!HOSTED_MODE || !state.from || !state.to) return;
    setProgress(true);
    try {
      await syncHostedPitstopPerformance(state.from, state.to);
      showNotice('');
      render();
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      state.grafanaPitstopError = error && error.message || 'Grafana pitstop performance could not be loaded.';
      showNotice('Live pitstop sales could not refresh. Workbook fallback data remains available. Please try Refresh again shortly.');
    } finally { setProgress(false); }
  }

  async function syncHostedEmailSales(requestedFrom, requestedTo) {
    if (!HOSTED_MODE) return;
    var from = requestedFrom || state.from, to = requestedTo || state.to;
    if (!from || !to) return;
    var rangeKey = from + '::' + to;
    if (state.emailSalesSyncRange === rangeKey) return;
    var cached = emailSalesResponseCache[rangeKey], payload;
    // Never treat an empty response as a successful sync. A transient Grafana
    // response (or an old edge-cache entry) otherwise gets remembered for the
    // whole browser cache window and Whole month appears as zero while a
    // shorter preset still works.
    var cachedRows = cached && cached.payload && Array.isArray(cached.payload.rows) ? cached.payload.rows : [];
    if (!state.forceDataRefresh && cached && cachedRows.length && Date.now() - cached.savedAt < PITSTOP_BROWSER_CACHE_MS) {
      payload = cached.payload;
    } else {
      if (activeEmailSalesRequest && activeEmailSalesRequest.key !== rangeKey) activeEmailSalesRequest.controller.abort();
      if (!activeEmailSalesRequest || activeEmailSalesRequest.key !== rangeKey) {
        var controller = new AbortController();
        var promise = fetchSourceJson('/api/email-sales?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to), 'emailSales', rangeKey, controller.signal, 'Order - Daily data could not be loaded.');
        activeEmailSalesRequest = { key: rangeKey, controller: controller, promise: promise };
      }
      var request = activeEmailSalesRequest;
      try { payload = await request.promise; }
      finally { if (activeEmailSalesRequest === request) activeEmailSalesRequest = null; }
      // Load one prior day as comparison context without changing the
      // selected-range moving average returned by the main Grafana query.
      var contextDate = shiftIsoDate(from, -1);
      if (payload && contextDate && !(payload.rows || []).some(function(row) { return row && row.date === contextDate; })) {
        try {
          var contextResponse = await fetch('/api/email-sales?from=' + encodeURIComponent(contextDate) + '&to=' + encodeURIComponent(contextDate) + refreshQuerySuffix(), { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
          var contextPayload = await contextResponse.json().catch(function() { return {}; });
          if (contextResponse.ok && Array.isArray(contextPayload.rows) && contextPayload.rows.length) payload = { ...payload, rows: (payload.rows || []).concat(contextPayload.rows) };
        } catch (_) {
          // A missing comparison row should only leave the first row neutral.
        }
      }
      // Cache only a populated result. Empty results must be retried on the
      // next render/filter action instead of masking a recovered API response.
      if (payload && Array.isArray(payload.rows) && payload.rows.length) {
        emailSalesResponseCache[rangeKey] = { savedAt: Date.now(), payload: payload };
        var cacheKeys = Object.keys(emailSalesResponseCache).sort(function(left, right) { return emailSalesResponseCache[right].savedAt - emailSalesResponseCache[left].savedAt; });
        cacheKeys.slice(6).forEach(function(key) { delete emailSalesResponseCache[key]; });
      } else {
        delete emailSalesResponseCache[rangeKey];
      }
    }
    // Do not let a response that was superseded by a newer calendar/preset
    // selection mark the newer range as loaded (which previously produced a
    // false zero state after changing away from the working 14-day preset).
    if (selectedRangeKey() !== rangeKey) return;
    state.grafanaEmailSalesRows = Array.isArray(payload.rows) ? payload.rows : [];
    state.grafanaEmailSalesSource = payload.source || 'Grafana Order - Daily';
    state.grafanaEmailSalesGeneratedAt = payload.generatedAt || '';
    // A populated response is the only response that can satisfy the range.
    // Keep the range unsynced when Grafana returned no rows so a retry is
    // possible without forcing a full page reload.
    state.emailSalesSyncRange = Array.isArray(payload.rows) && payload.rows.length ? rangeKey : '';
    state.emailSalesError = '';
  }

  async function syncHostedRsa(requestedFrom, requestedTo) {
    if (!HOSTED_MODE) return;
    var from = requestedFrom || state.from, to = requestedTo || state.to;
    if (!from || !to) return;
    var rangeKey = from + '::' + to, cached = rsaResponseCache[rangeKey], payload;
    if (!state.forceDataRefresh && cached && Date.now() - cached.savedAt < PITSTOP_BROWSER_CACHE_MS) {
      payload = cached.payload;
    } else {
      if (activeRsaRequest && activeRsaRequest.key !== rangeKey) activeRsaRequest.controller.abort();
      if (!activeRsaRequest || activeRsaRequest.key !== rangeKey) {
        var controller = new AbortController();
        var promise = fetchSourceJson('/api/rsa?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to), 'rsaGrafana', rangeKey, controller.signal, 'RSA data could not be loaded.');
        activeRsaRequest = { key: rangeKey, controller: controller, promise: promise };
      }
      var request = activeRsaRequest;
      try { payload = await request.promise; }
      finally { if (activeRsaRequest === request) activeRsaRequest = null; }
      rsaResponseCache[rangeKey] = { savedAt: Date.now(), payload: payload || {} };
      var cacheKeys = Object.keys(rsaResponseCache).sort(function(left, right) { return rsaResponseCache[right].savedAt - rsaResponseCache[left].savedAt; });
      cacheKeys.slice(6).forEach(function(key) { delete rsaResponseCache[key]; });
    }
    if (selectedRangeKey() !== rangeKey) return;
    state.grafanaRsaRows = Array.isArray(payload && payload.rows) ? payload.rows : [];
    state.grafanaRsaSource = payload && payload.source || 'Grafana RSA / RSA - Partners';
    state.grafanaRsaGeneratedAt = payload && payload.generatedAt || '';
    state.rsaSyncRange = rangeKey;
    state.rsaApiAvailable = true;
    state.rsaError = '';
  }

  async function syncRsaAfterFilter() {
    if (!HOSTED_MODE || !state.from || !state.to) return;
    state.rsaLoading = true;
    state.rsaError = '';
    try {
      await syncHostedRsa(state.from, state.to);
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      state.rsaApiAvailable = false;
      state.rsaSyncRange = '';
      state.rsaError = error && error.message || 'Grafana RSA / RSA - Partners data could not be loaded.';
    } finally {
      state.rsaLoading = false;
      render();
    }
  }

  function scheduleRsaSync(delay) {
    // RSA is manual by design. Keep this compatibility hook inert so older
    // range/navigation code cannot trigger Grafana and overwrite saved input.
    return;
  }

  async function syncHostedResq(requestedFrom, requestedTo, appliedRangeKey) {
    if (!HOSTED_MODE) return;
    var from = requestedFrom || state.from, to = requestedTo || state.to;
    if (!from || !to) return;
    var rangeKey = from + '::' + to, selectedKey = appliedRangeKey || rangeKey, cached = resqResponseCache[rangeKey], payload;
    if (!state.forceDataRefresh && cached && Date.now() - cached.savedAt < PITSTOP_BROWSER_CACHE_MS) {
      payload = cached.payload;
    } else {
      if (activeResqRequest && activeResqRequest.key !== rangeKey) activeResqRequest.controller.abort();
      if (!activeResqRequest || activeResqRequest.key !== rangeKey) {
        var controller = new AbortController();
        var promise = fetchSourceJson('/api/resq?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to), 'resq', rangeKey, controller.signal, 'ResQ data could not be loaded.');
        activeResqRequest = { key: rangeKey, controller: controller, promise: promise };
      }
      var request = activeResqRequest;
      try { payload = await request.promise; }
      finally { if (activeResqRequest === request) activeResqRequest = null; }
      resqResponseCache[rangeKey] = { savedAt: Date.now(), payload: payload || {} };
      var cacheKeys = Object.keys(resqResponseCache).sort(function(left, right) { return resqResponseCache[right].savedAt - resqResponseCache[left].savedAt; });
      cacheKeys.slice(6).forEach(function(key) { delete resqResponseCache[key]; });
    }
    if (selectedRangeKey() !== selectedKey) return;
    state.grafanaResqRows = Array.isArray(payload && payload.rows) ? payload.rows : [];
    state.grafanaResqSource = payload && payload.source || 'Grafana General / DSA - Orders / Orders - Detail';
    state.grafanaResqGeneratedAt = payload && payload.generatedAt || '';
    state.resqSyncRange = selectedKey;
    state.resqApiAvailable = true;
    state.resqError = '';
  }

  async function syncResqAfterFilter() {
    if (!HOSTED_MODE || !state.from || !state.to) return;
    state.resqLoading = true;
    state.resqError = '';
    try {
      // Include the calendar day before the selected period so the first
      // visible ResQ bar can compare with its true prior day.
      await syncHostedResq(priorServiceChartDate(state.from), state.to, selectedRangeKey());
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      state.resqApiAvailable = false;
      state.resqSyncRange = '';
      state.resqError = error && error.message || 'Grafana ResQ data could not be loaded.';
    } finally {
      state.resqLoading = false;
      render();
    }
  }

  function scheduleResqSync(delay) {
    if (!HOSTED_MODE) return;
    window.clearTimeout(syncResqAfterFilter.timer);
    syncResqAfterFilter.timer = window.setTimeout(syncResqAfterFilter, delay || 0);
  }

  async function syncHostedWarranty(requestedFrom, requestedTo) {
    if (!HOSTED_MODE) return;
    var from = requestedFrom || state.from, to = requestedTo || state.to;
    if (!from || !to) return;
    var rangeKey = from + '::' + to, cached = warrantyResponseCache[rangeKey], payload;
    if (!state.forceDataRefresh && cached && Date.now() - cached.savedAt < PITSTOP_BROWSER_CACHE_MS) {
      payload = cached.payload;
    } else {
      if (activeWarrantyRequest && activeWarrantyRequest.key !== rangeKey) activeWarrantyRequest.controller.abort();
      if (!activeWarrantyRequest || activeWarrantyRequest.key !== rangeKey) {
        var controller = new AbortController();
        var promise = fetchSourceJson('/api/warranty?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to), 'warranty', rangeKey, controller.signal, 'Warranty data could not be loaded.');
        activeWarrantyRequest = { key: rangeKey, controller: controller, promise: promise };
      }
      var request = activeWarrantyRequest;
      try { payload = await request.promise; }
      finally { if (activeWarrantyRequest === request) activeWarrantyRequest = null; }
      // An empty period is still a successful Grafana response. Cache it so
      // uploaded warranty values are never silently mixed into a valid
      // no-case period.
      warrantyResponseCache[rangeKey] = { savedAt: Date.now(), payload: payload || {} };
      var cacheKeys = Object.keys(warrantyResponseCache).sort(function(left, right) { return warrantyResponseCache[right].savedAt - warrantyResponseCache[left].savedAt; });
      cacheKeys.slice(6).forEach(function(key) { delete warrantyResponseCache[key]; });
    }
    if (selectedRangeKey() !== rangeKey) return;
    state.grafanaWarrantyRows = Array.isArray(payload && payload.rows) ? payload.rows : [];
    state.grafanaWarrantySource = payload && payload.source || 'Grafana Warranty / Order Details';
    state.grafanaWarrantyGeneratedAt = payload && payload.generatedAt || '';
    state.warrantySyncRange = rangeKey;
    state.warrantyApiAvailable = true;
    state.warrantyError = '';
  }

  async function syncWarrantyAfterFilter() {
    if (!HOSTED_MODE || !state.from || !state.to) return;
    state.warrantyLoading = true;
    state.warrantyError = '';
    try {
      await syncHostedWarranty(state.from, state.to);
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      state.warrantyApiAvailable = false;
      state.warrantySyncRange = '';
      state.warrantyError = error && error.message || 'Grafana Warranty / Order Details data could not be loaded.';
    } finally {
      state.warrantyLoading = false;
      render();
    }
  }

  function scheduleWarrantySync(delay) {
    if (!HOSTED_MODE) return;
    window.clearTimeout(syncWarrantyAfterFilter.timer);
    syncWarrantyAfterFilter.timer = window.setTimeout(syncWarrantyAfterFilter, delay || 0);
  }

  async function syncEmailSalesAfterFilter() {
    if (!HOSTED_MODE || ['overview', 'special', 'summary-header'].indexOf(state.view) === -1 || !state.from || !state.to) return;
    state.emailSalesLoading = true;
    state.emailSalesError = '';
    setProgress(true);
    render();
    var requestedKey = selectedRangeKey();
    try {
      await syncHostedEmailSales(state.from, state.to);
      if (selectedRangeKey() !== requestedKey) return;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        // An abort is normally caused by a newer range request.  If the range
        // did not actually change, retry once instead of leaving the UI at 0.
        if (selectedRangeKey() === requestedKey) scheduleEmailSalesSync(180);
        return;
      }
      state.emailSalesError = error && error.message || 'Grafana Order - Daily data could not be loaded.';
    } finally {
      state.emailSalesLoading = false;
      setProgress(false);
      render();
    }
  }

  function scheduleEmailSalesSync(delay) {
    if (!HOSTED_MODE || ['overview', 'special', 'summary-header'].indexOf(state.view) === -1) return;
    window.clearTimeout(syncEmailSalesAfterFilter.timer);
    syncEmailSalesAfterFilter.timer = window.setTimeout(syncEmailSalesAfterFilter, delay || 0);
  }

  async function loadHostedData(showSuccess) {
    if (!HOSTED_MODE || state.cloudLoading) return;
    state.cloudLoading = true;
    state.cloudError = '';
    setProgress(true);
    showNotice('');
    render();
    try {
      var historyPromise = loadPitstopHistoryManifest().catch(function() { state.pitstopHistoryManifest = null; return null; });
      var response = await fetch('/api/data', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Workbook HTTP ' + response.status);
      var stored = await response.json();
      var payload = stored.data || stored;
      if (stored.meta) {
        payload.loadedAt = stored.meta.uploadedAt || payload.loadedAt;
        payload.sourceName = stored.meta.sourceName || payload.sourceName;
      }
      state.data = normalizePayload(payload, payload.sourceName || 'Cloudflare master workbook');
      state.sourceName = state.data.sourceName;
      state.cloudUpdatedAt = stored.meta && stored.meta.uploadedAt || state.data.loadedAt || '';
      state.masterFingerprint = await reportContentHash({ pitstopMaster: payload.pitstopMaster || [], pitstopRelocations: payload.pitstopRelocations || [] });
      state.grafanaPitstopLastSync = '';
      state.grafanaPitstopSource = '';
      state.grafanaPitstopError = '';
      state.grafanaPitstopChannelTotals = null;
      state.grafanaPitstopSalesByKey = null;
      state.weekendPitstopSalesByKey = null;
      state.weekendPitstopSyncKey = '';
      state.weekendSalesSyncKey = '';
      resetSummaryNetworkSales();
      state.pitstopTotalsSyncRange = '';
      state.pitstopSyncRange = '';
      state.emailSalesSyncRange = '';
      state.rsaSyncRange = '';
      state.rsaApiAvailable = false;
      state.grafanaRsaRows = [];
      state.resqSyncRange = '';
      state.resqApiAvailable = false;
      state.grafanaResqRows = [];
      state.resqError = '';
      state.warrantySyncRange = '';
      state.warrantyApiAvailable = false;
      state.grafanaWarrantyRows = [];
      if (!state.from || !state.to) applyRangePreset('month');
      state.selectedKey = '';
      // Show workbook-backed tabs immediately. Grafana enriches the selected
      // report window in the background instead of blocking the first render.
      saveStored(state.data);
      render();
      updateUploadCentre();
      await historyPromise;
      var syncResults = await Promise.allSettled([
        syncHostedPitstopPerformance(state.from, state.to),
        syncHostedEmailSales(state.from, state.to),
        syncHostedWarranty(state.from, state.to),
        syncHostedResq(priorServiceChartDate(state.from), state.to, selectedRangeKey())
      ]);
      var grafanaError = syncResults[0].status === 'rejected' ? syncResults[0].reason : null;
      if (grafanaError && grafanaError.name !== 'AbortError') {
        state.grafanaPitstopError = grafanaError && grafanaError.message || 'Grafana pitstop performance could not be loaded.';
        state.data.dataIssues.push('Grafana HQ/BP performance panels are unavailable; Pitstop Explorer sales could not refresh.');
      }
      var salesError = syncResults[1].status === 'rejected' ? syncResults[1].reason : null;
      if (salesError && salesError.name !== 'AbortError') state.data.dataIssues.push('Grafana Order - Daily is unavailable; overview sales could not refresh.');
      var warrantyError = syncResults[2].status === 'rejected' ? syncResults[2].reason : null;
      if (warrantyError && warrantyError.name !== 'AbortError') {
        state.warrantyApiAvailable = false;
        state.warrantyError = warrantyError && warrantyError.message || 'Grafana Warranty / Order Details data could not be loaded.';
        state.data.dataIssues.push('Grafana Warranty / Order Details is unavailable: ' + state.warrantyError + ' Warranty values are not shown until the live source is available.');
      }
      var resqError = syncResults[3].status === 'rejected' ? syncResults[3].reason : null;
      if (resqError && resqError.name !== 'AbortError') {
        state.resqApiAvailable = false;
        state.resqError = resqError && resqError.message || 'Grafana General / DSA - Orders / Orders - Detail data could not be loaded.';
        state.data.dataIssues.push('Grafana General / DSA - Orders / Orders - Detail is unavailable: ' + state.resqError + ' ResQ values are not shown until the live source is available.');
      }
      render();
      if (showSuccess) showToast(state.grafanaPitstopLastSync ? 'Cloud workbook loaded and Grafana pitstop performance synced.' : 'Cloud workbook loaded.');
    } catch (error) {
      state.cloudError = error && error.message || 'Cloud data is unavailable.';
      showNotice(error.message.indexOf('401') !== -1 ? 'Sign in to load dashboard data.' : 'Cloud data is unavailable. The last browser copy is shown.');
    } finally {
      state.cloudLoading = false;
      setProgress(false);
      render();
    }
  }

  function readSharePointSource() {
    try { return localStorage.getItem(SHAREPOINT_SOURCE_KEY) || ''; } catch (error) { return ''; }
  }

  function saveSharePointSource(value) {
    try { localStorage.setItem(SHAREPOINT_SOURCE_KEY, value); } catch (error) { /* file:// storage may be disabled */ }
  }

  function sharePointWorkbookUrl(value) {
    var input = String(value || '').trim();
    if (!/^https?:\/\//i.test(input)) return '';
    try {
      var url = new URL(input);
      if (/sharepoint\.com$/i.test(url.hostname) || /sharepoint\.com/i.test(url.hostname) || /1drv\.ms$/i.test(url.hostname)) {
        url.searchParams.delete('web');
        url.searchParams.set('download', '1');
        return url.toString();
      }
    } catch (error) {
      return '';
    }
    return input;
  }

  function workbookRows(workbook, names) {
    var name = names.find(function(candidate) { return !!workbook.Sheets[candidate]; });
    return name ? window.XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '', raw: true }) : [];
  }

  function sharePointSourceLabel(sourceValue) {
    try {
      var url = new URL(sourceValue);
      var fileName = decodeURIComponent((url.pathname.split('/').filter(Boolean).pop() || 'Excel workbook').replace(/\+/g, ' '));
      return 'SharePoint: ' + fileName.replace(/\.xlsx?$/i, '');
    } catch (error) {
      return 'SharePoint Excel';
    }
  }

  async function loadSharePointWorkbook(sourceValue) {
    var sourceUrl = sharePointWorkbookUrl(sourceValue || readSharePointSource());
    if (!sourceUrl) { showNotice('Paste a valid SharePoint Excel link.'); return; }
    setProgress(true); showNotice('');
    try {
      if (!window.XLSX) throw new Error('Spreadsheet parser unavailable.');
      var response = await fetch(sourceUrl, { cache: 'no-store', credentials: 'include' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (contentType.indexOf('text/html') !== -1) throw new Error('SharePoint returned a web page instead of Excel.');
      var workbook = window.XLSX.read(await response.arrayBuffer(), { type: 'array', cellDates: false });
      var payload = {
        dailySales: workbookRows(workbook, WORKBOOK_SHEETS.dailySales),
        serviceWarranty: workbookRows(workbook, WORKBOOK_SHEETS.serviceWarranty),
        pitstops: workbookRows(workbook, WORKBOOK_SHEETS.pitstops),
        pitstopMaster: workbookRows(workbook, WORKBOOK_SHEETS.pitstopMaster),
        pitstopRelocations: workbookRows(workbook, WORKBOOK_SHEETS.pitstopRelocations),
        bgarage: workbookRows(workbook, WORKBOOK_SHEETS.bgarage),
        indonesia: workbookRows(workbook, WORKBOOK_SHEETS.indonesia),
        settings: workbookRows(workbook, WORKBOOK_SHEETS.settings),
        sourceName: sharePointSourceLabel(sourceUrl),
        generatedAt: localDateToday()
      };
      var normalized = normalizePayload(payload, payload.sourceName);
      if (!normalized.dailySales.length) throw new Error('No daily sales rows found.');
      state.data = normalized;
      state.sourceName = state.data.sourceName;
      state.grafanaPitstopSalesByKey = null;
      state.weekendPitstopSalesByKey = null;
      state.weekendPitstopSyncKey = '';
      state.weekendSalesSyncKey = '';
      resetSummaryNetworkSales();
      state.grafanaPitstopChannelTotals = null;
      state.pitstopTotalsSyncRange = '';
      state.pitstopSyncRange = '';
      applyRangePreset('month');
      state.selectedKey = '';
      saveSharePointSource(sourceValue || sourceUrl);
      saveStored(state.data);
      clearSharedWorkbook();
      render();
      updateUploadCentre();
      scheduleHostedWorkbookSync();
      showToast('Data loaded from SharePoint Excel.');
    } catch (error) {
      showNotice('Could not read the SharePoint Excel file. Use a link your browser can access, keep the sheets named Daily Sales, Service & Warranty, Pitstops, BGarage, and Settings, or use Upload Excel as fallback.');
    } finally {
      setProgress(false);
    }
  }

  // The report window is shared by every tab.  Do not derive its bounds from
  // Daily Sales alone: service, pitstop, BGarage, or Indonesia uploads may
  // contain the newest (or earliest) dated row.
  function reportDates() {
    var dates = [];
    ['dailySales', 'pitstops', 'bgarage', 'indonesia'].forEach(function(key) {
      (state.data[key] || []).forEach(function(row) { if (row.date) dates.push(row.date); });
    });
    Object.keys(state.manualBGarageSummaryValues || {}).forEach(function(date) { if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.push(date); });
    Object.keys(state.manualIndonesiaSummaryValues || {}).forEach(function(date) { if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.push(date); });
    return Array.from(new Set(dates)).sort();
  }
  function firstDate() { var dates = reportDates(); return dates[0] || ''; }
  // In hosted mode, Daily Sales is live Grafana data while the uploaded
  // workbook intentionally contains only manual sheets.  Therefore the
      // workbook's last date can lag behind the actual report date (for example,
      // manual rows end on 11 Aug while Grafana has completed sales through 13
      // Aug).  The report is always an as-of-yesterday report, so use yesterday as
      // the live upper bound and let the Grafana request fill those dates.  For a
  // standalone HTML file, keep using its own data bounds.
  //
  // Future-dated manual placeholders are ignored in both modes so they cannot
  // make a month-to-date selection query an empty future period and show zero.
  function lastDate() {
    var dates = reportDates(), today = localDateToday(), reportEnd = shiftIsoDate(today, -1), upperBound = HOSTED_MODE ? reportEnd : today, available = dates.filter(function(date) { return date <= upperBound; });
    if (HOSTED_MODE && reportEnd && (!available.length || available[available.length - 1] < reportEnd)) return reportEnd;
    return (available.length ? available[available.length - 1] : dates[dates.length - 1]) || '';
  }
  function liveReportEndDate() {
    return HOSTED_MODE ? shiftIsoDate(localDateToday(), -1) : lastDate();
  }
  function indonesiaSummaryLatestDate() {
    return liveReportEndDate() || shiftIsoDate(localDateToday(), -1) || lastDate();
  }
  function bgarageSummaryLatestDate() {
    return liveReportEndDate() || shiftIsoDate(localDateToday(), -1) || lastDate();
  }
  function normalizeIndonesiaSummaryDate(value) {
    var latest = indonesiaSummaryLatestDate(), date = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = latest;
    if (latest && date > latest) date = latest;
    return date;
  }
  function normalizeBGarageSummaryDate(value) {
    var latest = bgarageSummaryLatestDate(), date = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = latest;
    if (latest && date > latest) date = latest;
    return date;
  }
  function availableFirstDate() {
    var first = firstDate(), archiveFirst = state.pitstopHistoryManifest && state.pitstopHistoryManifest.from;
    return archiveFirst && (!first || archiveFirst < first) ? archiveFirst : first;
  }
  function grafanaPanelSalesFallback() { return null; }
  function rowsInRange() {
    var rangeKey = selectedRangeKey(), base = {}, sales = {}, resq = {}, warranty = {};
    (state.data.dailySales || []).forEach(function(row) { base[row.date] = row; });
    (state.grafanaEmailSalesRows || []).forEach(function(row) { sales[row.date] = row; });
    (state.grafanaResqRows || []).forEach(function(row) { resq[row.date] = row; });
    (state.grafanaWarrantyRows || []).forEach(function(row) { warranty[row.date] = row; });
    var salesReady = !HOSTED_MODE || state.emailSalesSyncRange === rangeKey;
    var resqReady = !HOSTED_MODE || state.resqApiAvailable && state.resqSyncRange === rangeKey;
    var warrantyReady = !HOSTED_MODE || state.warrantyApiAvailable && state.warrantySyncRange === rangeKey;
    var dates = [], date = state.from;
    while (date && date <= state.to && dates.length < 1100) { dates.push(date); date = shiftIsoDate(date, 1); }
    return dates.map(function(date) {
      var row = Object.assign({ date: date, wh: 0, whAvailable: false }, base[date] || {}), live = sales[date] || {};
      if (HOSTED_MODE) { row.b2c = salesReady ? numberValue(live.b2c) : NaN; row.b2b2c = salesReady ? numberValue(live.b2b2c) : NaN; }
      row.hq = row.b2c; row.bp = row.b2b2c;
      ['rsaJumpstart', 'rsaTyrePatch', 'rsaFuel'].forEach(function(field) { row[field] = manualRsaValue(date, field); });
      row.b2w = manualB2wValue(date);
      ['resQSelangor', 'resQJb', 'resQPahang', 'resQPenang'].forEach(function(field) { row[field] = HOSTED_MODE ? resqReady ? numberValue((resq[date] || {})[field]) : NaN : numberValue(row[field]); });
      ['warranty1st', 'warranty2nd', 'warranty3rd'].forEach(function(field) { row[field] = HOSTED_MODE ? warrantyReady ? numberValue((warranty[date] || {})[field]) : NaN : numberValue(row[field]); });
      row.total = totalSales(row);
      row.resQ = row.resQSelangor + row.resQJb + row.resQPahang + row.resQPenang;
      row.warranty = totalWarranty(row);
      return row;
    });
  }
  function priorDailySalesRow(date) {
    var priorDate = shiftIsoDate(date, -1);
    if (!priorDate) return null;
    var liveRows = state.grafanaEmailSalesRows || [], savedRows = state.data.dailySales || [];
    var exact = liveRows.concat(savedRows).filter(function(row) { return row && row.date === priorDate; }).pop();
    if (exact) return exact;
    // The selected range intentionally hides the boundary row. If a source
    // omits the exact boundary row, use the latest earlier source row so the
    // movement cell still remains a directional comparison.
    return liveRows.concat(savedRows).filter(function(row) { return row && row.date && row.date < date; }).sort(function(a, b) { return a.date.localeCompare(b.date); }).pop() || null;
  }
  function manualBGarageRowsForWindow(from, to) {
    var rows = [];
    Object.keys(state.manualBGarageSummaryValues || {}).forEach(function(date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (from && date < from) || (to && date > to)) return;
      var value = state.manualBGarageSummaryValues[date] || {};
      (value.rows || []).forEach(function(row) {
        if (!row || !String(row.outlet || '').trim()) return;
        rows.push({ date: date, outlet: String(row.outlet).trim(), dailyTarget: numberValue(row.dailyTarget), dailyActual: numberValue(row.dailyActual), mtdActual: numberValue(row.mtdActual), monthlyTarget: numberValue(row.monthlyTarget), referrals: numberValue(row.referrals), conversions: numberValue(row.conversions), pickDrop: numberValue(row.pickDrop), intakeActual: numberValue(row.intakeActual), intakeTarget: numberValue(row.intakeTarget) });
      });
    });
    return rows;
  }
  function bgarageRowsForWindow(from, to) {
    var manualRows = manualBGarageRowsForWindow(from, to), manualDates = {};
    Object.keys(state.manualBGarageSummaryValues || {}).forEach(function(date) { manualDates[date] = true; });
    return (state.data.bgarage || []).filter(function(row) { return !!row.date && (!from || row.date >= from) && (!to || row.date <= to) && !manualDates[row.date]; }).concat(manualRows);
  }
  function bgarageRowsForPeriod() { return bgarageRowsForWindow(state.from, state.to); }
  function pitstopsForPeriod() {
    var rows = state.data.pitstops || [], hasDatedRows = rows.some(function(row) { return !!row.date; });
    // Legacy snapshot workbooks may omit Date entirely; keep those rows
    // visible.  Once any dated rows exist, undated rows must not bypass the
    // shared From/To filter.
    var matching = rows.filter(function(row) { return hasDatedRows ? !!row.date && (!state.from || row.date >= state.from) && (!state.to || row.date <= state.to) : true; });
    return aggregatePitstopRows(matching);
  }
  function aggregatePitstopRows(rows) {
    var groups = {};
    (rows || []).forEach(function(row) {
      var channel = canonicalChannel(row.channel || 'HQ'), name = String(row.name || 'Unnamed pitstop').trim(), key = channel + '::' + name.toUpperCase();
      var group = groups[key];
      if (!group) {
        group = Object.assign({}, row, { channel: channel, name: name, target: 0, sales: 0, date: row.date || '' });
      }
      group.target += numberValue(row.target);
      group.sales += numberValue(row.sales);
      // Keep the latest descriptive values when a workbook contains a
      // repeated pitstop row for each day.
      if (row.date && (!group.date || row.date >= group.date)) {
        group.date = row.date;
        group.region = row.region;
        group.state = row.state;
        group.tier = row.tier;
      }
      groups[key] = group;
    });
    return Object.keys(groups).map(function(key) {
      var row = groups[key], achievement = row.target > 0 ? Math.round(row.sales / row.target * 100) : 0;
      row.achievement = achievement;
      row.variance = row.sales - row.target;
      row.status = pitstopStatusValue(row.sales, row.target);
      return row;
    });
  }
  function bgarageRowsInRange() { return bgarageRowsForPeriod(); }
  function aggregateBGarageRows(rows) {
    var groups = {};
    (rows || []).forEach(function(row) {
      var key = String(row.outlet || '').trim().toUpperCase();
      if (!key) return;
      var group = groups[key];
      if (!group) {
        group = Object.assign({}, row, {
          dailyTarget: row.dailyTarget === null ? null : 0,
          dailyActual: row.dailyActual === null ? null : 0,
          referrals: 0,
          conversions: 0,
          pickDrop: 0,
          intakeActual: row.intakeActual === null ? null : 0,
          intakeTarget: row.intakeTarget === null ? null : 0
        });
      }
      if (row.date && (!group.date || row.date > group.date)) {
        // MTD fields are already cumulative in the source workbook. Keep
        // the latest snapshot in the selected window instead of double-counting.
        group.date = row.date;
        group.mtdActual = row.mtdActual;
        group.monthlyTarget = row.monthlyTarget;
      }
      if (row.dailyTarget !== null) group.dailyTarget = (group.dailyTarget === null ? 0 : group.dailyTarget) + row.dailyTarget;
      if (row.dailyActual !== null) group.dailyActual = (group.dailyActual === null ? 0 : group.dailyActual) + row.dailyActual;
      group.referrals += row.referrals || 0;
      group.conversions += row.conversions || 0;
      group.pickDrop += row.pickDrop || 0;
      if (row.intakeActual !== null) group.intakeActual = (group.intakeActual === null ? 0 : group.intakeActual) + row.intakeActual;
      if (row.intakeTarget !== null) group.intakeTarget = (group.intakeTarget === null ? 0 : group.intakeTarget) + row.intakeTarget;
      groups[key] = group;
    });
    return Object.keys(groups).map(function(key) {
      var row = groups[key];
      row.dailyAchievement = row.dailyTarget > 0 && row.dailyActual !== null ? Math.round(row.dailyActual / row.dailyTarget * 100) : null;
      row.mtdAchievement = row.monthlyTarget > 0 && row.mtdActual !== null ? Math.round(row.mtdActual / row.monthlyTarget * 100) : null;
      row.shortfall = row.mtdActual !== null && row.monthlyTarget !== null ? row.mtdActual - row.monthlyTarget : null;
      row.intakeAchievement = row.intakeTarget > 0 && row.intakeActual !== null ? Math.round(row.intakeActual / row.intakeTarget * 100) : null;
      return row;
    });
  }
  function bgaragePeriodNote() {
    var allRows = state.data.bgarage || [], matchingRows = bgarageRowsForPeriod();
    if (!allRows.length || matchingRows.length) return '';
    var availableDates = allRows.map(function(row) { return row.date; }).filter(Boolean).sort();
    return '<div class="daily-detail-note is-warning">No BGarage data falls within the selected report window. Available data: ' + escapeHtml(formatRange(availableDates[0], availableDates[availableDates.length - 1])) + '.</div>';
  }

  function kpi(icon, tone, label, value, detail, action) {
    var tag = action ? 'button' : 'article';
    var actionAttrs = action ? ' type="button" data-open-pitstops="' + action + '"' : '';
    return '<' + tag + ' class="kpi-card' + (action ? ' is-action' : '') + '"' + actionAttrs + '><div class="kpi-topline"><span class="kpi-icon ' + tone + '">' + icon + '</span><span class="kpi-label">' + label + '</span></div><div class="kpi-value">' + value + '</div><div class="kpi-detail">' + detail + '</div></' + tag + '>';
  }

  function trendDayLabel(iso) {
    var match = String(iso || '').slice(0, 10).match(/^\d{4}-\d{2}-(\d{2})$/);
    return match ? String(Number(match[1])) : formatDate(iso);
  }

  function trendMonthLabel(iso) {
    var match = String(iso || '').slice(0, 10).match(/^\d{4}-(\d{2})-\d{2}$/);
    var months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return match ? months[Number(match[1]) - 1] || '' : '';
  }

  function trendSvg(rows, benchmark) {
    if (rows.some(function(row) { return !Number.isFinite(totalSales(row)); })) return '<div class="empty-state">Sales data is unavailable for the selected range.</div>';
    if (!rows.length) return '<div class="empty-state">No sales rows match the selected period.</div>';
    var width = 820, height = 300, pad = { top: 20, right: 22, bottom: 48, left: 50 }, innerWidth = width - pad.left - pad.right, innerHeight = height - pad.top - pad.bottom;
    var trendChannel = ['all', 'hq', 'bp'].indexOf(state.dailyDetailChannel) !== -1 ? state.dailyDetailChannel : 'all';
    var showHq = trendChannel === 'all' || trendChannel === 'hq', showBp = trendChannel === 'all' || trendChannel === 'bp';
    var totals = rows.map(function(row) { return salesTotalForChannel(row, trendChannel); });
    var max = Math.max.apply(Math, totals.concat([1]));
    var chartMax = Math.ceil(max / 500) * 500;
    var step = rows.length <= 1 ? innerWidth : innerWidth / rows.length;
    var x = function(index) { return pad.left + (rows.length <= 1 ? innerWidth / 2 : step * index + step / 2); };
    var y = function(value) { return pad.top + innerHeight - value / chartMax * innerHeight; };
    var path = function(values) { return values.map(function(value, index) { return (index ? 'L' : 'M') + ' ' + x(index).toFixed(1) + ' ' + y(value).toFixed(1); }).join(' '); };
    var movingAverage = totals.map(function(value, index) { var start = Math.max(0, index - 2), window = totals.slice(start, index + 1); return window.reduce(function(sum, item) { return sum + item; }, 0) / window.length; });
    var ticks = [0, .25, .5, .75, 1];
    var html = '<svg class="trend-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Daily sales composition by channel with three-day moving average"><title>Daily sales mix</title><desc>Stacked columns show HQ and BP units. Each segment is labelled, exact totals appear above the columns, and the line shows the three-day moving average.</desc>', segmentLabels = '';
    ticks.forEach(function(tick) { var value = chartMax * tick; html += '<line class="grid" x1="' + pad.left + '" x2="' + (width - pad.right) + '" y1="' + y(value) + '" y2="' + y(value) + '"></line><text class="axis" x="' + (pad.left - 10) + '" y="' + (y(value) + 4) + '" text-anchor="end">' + formatCompact(value) + '</text>'; });
    rows.forEach(function(row, index) { html += '<line class="grid vertical" x1="' + x(index) + '" x2="' + x(index) + '" y1="' + pad.top + '" y2="' + (pad.top + innerHeight) + '"></line>'; });
    rows.forEach(function(row, index) {
      var barWidth = Math.max(14, Math.min(48, step * .64)), barX = x(index) - barWidth / 2, baseline = y(0), cumulative = 0;
      var channels = [{ visible: showHq, value: row.b2c, className: 'sales-hq', label: 'HQ' }, { visible: showBp, value: row.b2b2c, className: 'sales-bp', label: 'BP' }];
      html += '<g class="sales-stack' + (index === rows.length - 1 ? ' is-latest' : '') + '"><title>' + formatDate(row.date, true) + ': ' + formatNumber(totals[index]) + ' units</title>';
      channels.forEach(function(channel) {
        if (!channel.visible || !channel.value) return;
        var top = y(cumulative + channel.value), bottom = y(cumulative), segmentHeight = Math.max(2, bottom - top);
        html += '<rect class="' + channel.className + '" x="' + barX.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + segmentHeight.toFixed(1) + '"><title>' + channel.label + ': ' + formatNumber(channel.value) + ' units</title></rect>';
        segmentLabels += '<text class="sales-segment-label ' + channel.className + '-label" x="' + x(index).toFixed(1) + '" y="' + (top + segmentHeight / 2 + 4).toFixed(1) + '" text-anchor="middle">' + channel.label + '</text>';
        cumulative += channel.value;
      });
      if (index === rows.length - 1) html += '<rect class="latest-outline" x="' + (barX - 2).toFixed(1) + '" y="' + (y(totals[index]) - 2).toFixed(1) + '" width="' + (barWidth + 4).toFixed(1) + '" height="' + Math.max(4, baseline - y(totals[index]) + 4).toFixed(1) + '" rx="3" ry="3"></rect>';
      html += '</g>';
    });
    html += '<path class="line-average" d="' + path(movingAverage) + '"></path><circle class="latest-dot" cx="' + x(rows.length - 1) + '" cy="' + y(movingAverage[movingAverage.length - 1]) + '" r="4"></circle>' + segmentLabels;
    rows.forEach(function(row, index) {
      var label = formatNumber(totals[index]), labelY = Math.max(pad.top + 9, y(totals[index]) - 7);
      // One compact plain-text total per day keeps a full 31-day month readable.
      // The latest day remains visually distinct through its bar outline.
      html += '<text class="bar-total-label bar-total-label-compact" x="' + x(index).toFixed(1) + '" y="' + labelY.toFixed(1) + '" text-anchor="middle">' + label + '</text>';
    });
    rows.forEach(function(row, index) { html += '<text class="axis" x="' + x(index) + '" y="' + (height - 14) + '" text-anchor="middle">' + trendDayLabel(row.date) + '</text>'; });
    if (rows.length) html += '<text class="trend-month-label" x="' + (width - pad.right) + '" y="' + (height - 2) + '" text-anchor="end">' + trendMonthLabel(rows[rows.length - 1].date) + '</text>';
    return html + '</svg><div class="chart-legend">' + (showHq ? '<span><i class="legend-box hq"></i>HQ units</span>' : '') + (showBp ? '<span><i class="legend-box bp"></i>BP units</span>' : '') + '<span><i class="legend-line average"></i>3-day average</span><span><i class="legend-outline latest"></i>Latest day</span></div>';
  }

  function regionSummary(pitstops) {
    var grouped = {};
    var tierNames = ['Tier 1', 'Tier 2', 'Tier 3'];
    var blankTier = function(name) { return { name: name, pitstops: 0, red: 0, sales: 0, target: 0, achievement: 0 }; };
    pitstops.forEach(function(pitstop) {
      var item = grouped[pitstop.region];
      if (!item) {
        item = { name: pitstop.region, pitstops: 0, red: 0, sales: 0, target: 0, achievement: 0, tiers: {} };
        tierNames.forEach(function(name) { item.tiers[name] = blankTier(name); });
      }
      var tierName = String(pitstop.tier || '').trim() || 'Unassigned';
      if (!item.tiers[tierName]) item.tiers[tierName] = blankTier(tierName);
      var tier = item.tiers[tierName];
      item.pitstops += 1; item.red += pitstop.status === 'red' ? 1 : 0; item.sales += pitstop.sales; item.target += pitstop.target;
      tier.pitstops += 1; tier.red += pitstop.status === 'red' ? 1 : 0; tier.sales += pitstop.sales; tier.target += pitstop.target;
      grouped[pitstop.region] = item;
    });
    return Object.keys(grouped).map(function(key) {
      var item = grouped[key];
      item.achievement = item.target ? Math.round(item.sales / item.target * 100) : 0;
      item.tierOrder = tierNames.concat(Object.keys(item.tiers).filter(function(name) { return tierNames.indexOf(name) === -1; }));
      item.tierOrder.forEach(function(name) { var tier = item.tiers[name]; tier.achievement = tier.target ? Math.round(tier.sales / tier.target * 100) : 0; });
      return item;
    }).sort(function(a, b) { return a.achievement - b.achievement; });
  }

  function regionTierCell(region, tierName) {
    var tier = region.tiers[tierName] || { pitstops: 0, red: 0, sales: 0, target: 0, achievement: 0 };
    var empty = !tier.pitstops;
    var level = empty ? 'empty' : pitstopStatusValue(tier.sales, tier.target);
    return '<td class="region-matrix-cell ' + level + '"><strong>' + (empty ? '-' : tier.achievement + '%') + '</strong><span>' + formatNumber(tier.sales) + ' / ' + formatNumber(tier.target) + ' units</span><small>' + tier.pitstops + ' loc / ' + tier.red + ' action</small></td>';
  }

  function renderOverview() {
    var rows = rowsInRange(), data = state.data, firstPrior = rows.length ? priorDailySalesRow(rows[0].date) : null, hasDailyTarget = Number(data.benchmark) > 0, pitstops = pitstopsForPeriod().filter(function(pitstop) { return pitstop.channel !== 'HQC' && pitstop.channel !== 'BPC'; }), total = rows.reduce(function(sum, row) { return sum + row.total; }, 0), target = hasDailyTarget ? data.benchmark * rows.length : 0, latest = rows[rows.length - 1], previous = rows[rows.length - 2] || firstPrior, average = rows.length ? total / rows.length : 0, redPitstops = pitstops.filter(function(pitstop) { return pitstop.status === 'red'; }), focus = pitstops.slice().sort(function(a, b) { return a.variance - b.variance; }).slice(0, 5), regions = regionSummary(pitstops);
    var tierNames = ['Tier 1', 'Tier 2', 'Tier 3'];
    var visibleTierNames = state.regionTierFocus === 'all' ? tierNames : tierNames.filter(function(name) { return name === state.regionTierFocus; });
    var tierFocusOptions = ['all'].concat(tierNames).map(function(value) { return '<button type="button" class="tier-focus-button ' + (state.regionTierFocus === value ? 'is-active' : '') + '" data-region-tier-focus="' + escapeHtml(value) + '">' + escapeHtml(value === 'all' ? 'All' : value) + '</button>'; }).join('');
    var regionHtml = regions.map(function(region) {
      var level = pitstopStatusValue(region.sales, region.target);
      var tierHtml = visibleTierNames.map(function(tierName) { return regionTierCell(region, tierName); }).join('');
      return '<tr><th scope="row"><strong>' + escapeHtml(region.name) + '</strong><span>' + region.pitstops + ' locations / ' + region.red + ' action</span></th><td class="region-overall-cell"><strong class="' + (level === 'green' ? 'good' : level === 'yellow' ? 'watch' : 'bad') + '">' + region.achievement + '%</strong><div class="progress-track"><span class="progress-fill ' + level + '" style="width:' + Math.min(region.achievement, 100) + '%"></span></div><small>' + formatNumber(region.sales) + ' / ' + formatNumber(region.target) + ' units</small></td>' + tierHtml + '</tr>';
    }).join('');
    var regionHeaders = '<th>Region</th><th>Overall</th>' + visibleTierNames.map(function(tierName) { return '<th>' + escapeHtml(tierName) + '</th>'; }).join('');
    var serviceSeries = [{ key: 'rsaJumpstart', label: 'RSA jumpstart', color: '#0f766e' }, { key: 'rsaTyrePatch', label: 'RSA tyre patch', color: '#1479a8' }, { key: 'rsaFuel', label: 'RSA fuel', color: '#c48714' }, { key: 'b2w', label: 'B2W', color: '#7051b8' }, { key: 'resQ', label: 'ResQ', color: '#c74d42' }];
    var serviceTotals = serviceSeries.map(function(series) { return { ...series, value: rows.reduce(function(sum, row) { return sum + serviceValue(row, series.key); }, 0) }; }), maxService = Math.max.apply(Math, serviceTotals.map(function(series) { return series.value; }).concat([1]));
    var mixHtml = serviceTotals.map(function(series) { return '<div class="mix-row"><div class="mix-label"><span><i class="mix-swatch" style="background:' + series.color + '"></i>' + series.label + '</span><strong>' + formatNumber(series.value) + '</strong></div><div class="progress-track"><span class="progress-fill" style="width:' + (series.value / maxService * 100) + '%;background:' + series.color + '"></span></div></div>'; }).join('');
    var focusHtml = focus.length ? focus.map(function(pitstop) { return '<button type="button" class="focus-row" data-open-pitstops="' + pitstop.status + '"><span class="status-marker ' + statusClass(pitstop.status) + '"></span><span class="focus-copy"><strong>' + escapeHtml(pitstop.name) + '</strong><small>' + escapeHtml(pitstop.state) + ' / ' + escapeHtml(channelLabel(pitstop.channel)) + '</small></span><span class="focus-metric"><strong>' + pitstop.achievement + '%</strong><small>' + (pitstop.variance >= 0 ? '+' : '') + formatNumber(pitstop.variance) + ' vs target</small></span><span aria-hidden="true">&gt;</span></button>'; }).join('') : '<div class="empty-state">No pitstop rows are available.</div>';
    var previousText = latest && previous ? '<strong class="' + (latest.total >= previous.total ? 'good' : 'bad') + '">' + (latest.total >= previous.total ? 'Up' : 'Down') + ' vs prior day</strong>' : '';
    var detailChannel = ['all', 'hq', 'bp'].indexOf(state.dailyDetailChannel) !== -1 ? state.dailyDetailChannel : 'all';
    var detailLabel = dailyDetailLabel(detailChannel);
    var detailHasWh = rows.some(function(row) { return row.whAvailable; });
    var detailFilter = '<div class="daily-detail-filter" role="group" aria-label="Daily sales channel filter"><span>Show</span><button type="button" class="daily-detail-button all ' + (detailChannel === 'all' ? 'is-active' : '') + '" data-daily-detail-channel="all">All</button><button type="button" class="daily-detail-button hq ' + (detailChannel === 'hq' ? 'is-active' : '') + '" data-daily-detail-channel="hq">HQ</button><button type="button" class="daily-detail-button bp ' + (detailChannel === 'bp' ? 'is-active' : '') + '" data-daily-detail-channel="bp">BP</button></div>';
    var detailNotice = detailChannel === 'wh' && !detailHasWh ? '<span class="daily-detail-note">No WH column in this upload</span>' : '';
    var salesHeaders = detailChannel === 'all' ? '<th>Date</th><th>HQ units</th><th>BP units</th><th>Total units</th><th>Movement</th>' + (hasDailyTarget ? '<th>Target status</th>' : '') : '<th>Date</th><th>' + detailLabel + ' units</th><th>Total units</th><th>Movement</th>' + (hasDailyTarget ? '<th>Target status</th>' : '');
    var salesColspan = detailChannel === 'all' ? (hasDailyTarget ? 6 : 5) : (hasDailyTarget ? 5 : 4);
    var salesTableRows = rows.map(function(row, index) {
      var prior = index ? rows[index - 1] : firstPrior, movement = row.total >= (prior ? prior.total : 0) ? 'Increase' : 'Decrease', movementHtml = '<span class="movement-badge ' + (movement === 'Increase' ? 'increase' : 'decrease') + '">' + movement + '</span>', statusHtml = hasDailyTarget ? (row.total >= data.benchmark ? '<span class="performance-badge achieved">Target met</span>' : '<span class="performance-badge critical">Below target</span>') : '';
      if (detailChannel === 'all') return '<tr><td><strong>' + escapeHtml(formatDate(row.date, true)) + '</strong></td><td><strong>' + formatNumber(dailyDetailValue(row, 'hq')) + '</strong></td><td><strong>' + formatNumber(dailyDetailValue(row, 'bp')) + '</strong></td><td><strong>' + formatNumber(row.total) + '</strong></td><td>' + movementHtml + '</td>' + (hasDailyTarget ? '<td>' + statusHtml + '</td>' : '') + '</tr>';
      var value = detailChannel === 'wh' && !row.whAvailable ? '-' : formatNumber(dailyDetailValue(row, detailChannel));
      return '<tr><td><strong>' + escapeHtml(formatDate(row.date, true)) + '</strong></td><td><strong>' + value + '</strong></td><td><strong>' + formatNumber(row.total) + '</strong></td><td>' + movementHtml + '</td>' + (hasDailyTarget ? '<td>' + statusHtml + '</td>' : '') + '</tr>';
    }).join('');
    var salesPanel = '<article class="panel daily-detail-panel"><div class="panel-header"><div><span class="eyebrow">Daily detail</span><h2>HQ &amp; BP sales</h2><p>Every day in the selected report window, including movement.</p></div><div class="daily-detail-actions">' + detailFilter + '<span class="result-count">' + rows.length + ' days</span></div></div>' + detailNotice + '<div class="table-scroll"><table class="data-table sales-detail-table sales-detail-' + detailChannel + '"><thead><tr>' + salesHeaders + '</tr></thead><tbody>' + (salesTableRows || '<tr><td colspan="' + salesColspan + '"><div class="empty-state">No daily sales rows match this period.</div></td></tr>') + '</tbody></table></div></article>';
    var salesKpiDetail = hasDailyTarget ? '<strong>' + percentage(total, target) + '%</strong> of period target' : 'HQ + BP units';
    var averageKpiDetail = hasDailyTarget ? '<strong>' + rows.filter(function(row) { return row.total >= data.benchmark; }).length + '/' + (rows.length || 0) + '</strong> days hit target' : 'Across ' + (rows.length || 0) + ' available days';
    var trendChannel = ['all', 'hq', 'bp'].indexOf(state.dailyDetailChannel) !== -1 ? state.dailyDetailChannel : 'all', trendLabel = trendChannel === 'all' ? 'HQ and BP totals' : dailyDetailLabel(trendChannel) + ' totals';
    var trendSubtitle = hasDailyTarget ? escapeHtml(formatRange(rows[0] ? rows[0].date : '', rows[rows.length - 1] ? rows[rows.length - 1].date : '')) + ' compared with the ' + formatNumber(data.benchmark) + ' daily target.' : escapeHtml(formatRange(rows[0] ? rows[0].date : '', rows[rows.length - 1] ? rows[rows.length - 1].date : '')) + ' showing ' + trendLabel + '.';
    var latestTrendTotal = latest ? salesTotalForChannel(latest, trendChannel) : 0, previousTrendTotal = previous ? salesTotalForChannel(previous, trendChannel) : 0, latestDelta = latest && previous ? latestTrendTotal - previousTrendTotal : null;
    var trendInsight = latest ? '<strong>' + (latestDelta === null ? 'Latest day total.' : latestDelta >= 0 ? 'Sales increased.' : 'Sales decreased.') + '</strong><span>' + formatNumber(latest.total) + ' units' + (latestDelta === null ? ' across HQ and BP.' : ' · ' + (latestDelta >= 0 ? '+' : '') + formatNumber(latestDelta) + ' units versus the prior day.') + '</span>' : '<strong>No sales data.</strong><span>Load a daily data file to begin.</span>';
    return '<section class="kpi-grid">' + kpi('S', 'teal', 'Sales in period', formatNumber(total), salesKpiDetail) + kpi('D', 'blue', 'Latest day', formatNumber(latest ? latest.total : 0), (latest ? formatDate(latest.date, true) : 'No latest row') + ' ' + previousText) + kpi('A', 'amber', 'Average per day', formatNumber(average), averageKpiDetail) + kpi('!', 'red', 'Pitstops needing action', formatNumber(redPitstops.length), '<strong>' + percentage(redPitstops.length, pitstops.length) + '%</strong> of shown locations', 'red') + '</section><section class="overview-top-grid">' + salesPanel + '<section class="overview-side-stack"><article class="panel"><div class="panel-header"><div><span class="eyebrow">Momentum</span><h2>Daily sales trend</h2><p>' + trendSubtitle + '</p></div><div class="toggle-group"><button type="button" class="toggle-button ' + (state.showB2c ? 'is-active' : '') + '" data-toggle="b2c"><span class="control-dot hq"></span>HQ</button><button type="button" class="toggle-button ' + (state.showB2b2c ? 'is-active' : '') + '" data-toggle="b2b2c"><span class="control-dot bp"></span>BP</button></div></div>' + trendSvg(rows, data.benchmark) + '<div class="chart-insight">' + trendInsight + '</div></article><article class="panel"><div class="panel-header"><div><span class="eyebrow">Action queue</span><h2>Locations to focus on</h2><p>Lowest achievement against location target.</p></div><button type="button" class="text-button" data-open-pitstops="red">Open explorer &gt;</button></div><div class="focus-list">' + focusHtml + '</div></article></section></section><section class="lower-grid"><article class="panel region-matrix-panel"><div class="panel-header"><div><span class="eyebrow">Network health</span><h2>Region by tier</h2><p>Use the tier filter to show all tiers or one tier at a time.</p></div><div class="tier-focus-control" role="group" aria-label="Filter tier">' + tierFocusOptions + '</div></div><div class="table-scroll"><table class="region-matrix-table"><thead><tr>' + regionHeaders + '</tr></thead><tbody>' + (regionHtml || '<tr><td colspan="' + (visibleTierNames.length + 2) + '"><div class="empty-state">No region rows are available.</div></td></tr>') + '</tbody></table></div></article><article class="panel"><div class="panel-header"><div><span class="eyebrow">Service load</span><h2>Support mix</h2><p>Service activity in the selected period.</p></div><button type="button" class="text-button" data-view-link="services">Open services &gt;</button></div><div class="mix-list">' + mixHtml + '</div><div class="summary-total"><span>Total services</span><strong>' + formatNumber(rows.reduce(function(sum, row) { return sum + totalServices(row); }, 0)) + '</strong></div></article></section>';
  }

  function renderPitstops() {
    var pitstops = pitstopsForPeriod(), needle = state.pitSearch.trim().toLowerCase();
    var pitstopSourceNote = state.grafanaPitstopLastSync
? ' Pitstop Master controls the active pitstop list, channel, state, region and tier. Target accumulates by selected calendar day (Tier 1: 12/day, Tier 2: 9/day, Tier 3: 7/day). HQ sales sync from ALL PERFORMANCE (HQ) HTML and BP sales sync from ALL PERFORMANCE (BP) HTML. Status is calculated from Sales ÷ accumulated Target: Green 100%+, Yellow 90–99% or at most 1 unit short, Red otherwise.'
      : ' Pitstop Master controls the active pitstop list, channel, state, region and tier. Target is derived from tier (Tier 1: 12, Tier 2: 9, Tier 3: 7). Sales currently comes from the uploaded workbook; status is calculated from Sales ÷ Target.';
    var selectedChannels = Array.isArray(state.pitChannels) && state.pitChannels.length ? state.pitChannels : ['HQ', 'WH'];
    var filtered = pitstops.filter(function(pitstop) {
      return (state.pitStatus === 'all' || pitstop.status === state.pitStatus) && selectedChannels.indexOf(pitstop.channel) !== -1 && (state.pitRegion === 'all' || pitstop.region === state.pitRegion) && (state.pitState === 'all' || pitstop.state === state.pitState) && (state.pitTier === 'all' || pitstop.tier === state.pitTier) && (!needle || (pitstop.name + ' ' + pitstop.region + ' ' + pitstop.state).toLowerCase().indexOf(needle) !== -1);
    });
    filtered.sort(function(a, b) {
      if (state.pitArrange === 'state') return summaryStateRank(a.state, 'hq') - summaryStateRank(b.state, 'hq') || a.achievement - b.achievement || a.name.localeCompare(b.name);
      if (state.pitArrange === 'region') return a.region.localeCompare(b.region) || a.state.localeCompare(b.state) || a.name.localeCompare(b.name);
      if (state.pitArrange === 'achievement') return a.achievement - b.achievement || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name) || a.state.localeCompare(b.state);
    });
    var counts = { all: pitstops.length, red: pitstops.filter(function(pitstop) { return pitstop.status === 'red'; }).length, yellow: pitstops.filter(function(pitstop) { return pitstop.status === 'yellow'; }).length, green: pitstops.filter(function(pitstop) { return pitstop.status === 'green'; }).length };
    var regions = Array.from(new Set(pitstops.map(function(pitstop) { return pitstop.region; }))).sort(), states = Array.from(new Set(pitstops.map(function(pitstop) { return pitstop.state; }))).sort(function(a, b) { return summaryStateRank(a, 'hq') - summaryStateRank(b, 'hq') || a.localeCompare(b); }), tiers = Array.from(new Set(pitstops.map(function(pitstop) { return pitstop.tier; }))).sort(function(a, b) { var aNumber = Number((String(a).match(/\d+/) || [999])[0]), bNumber = Number((String(b).match(/\d+/) || [999])[0]); return aNumber - bNumber || a.localeCompare(b); });
    var statusTabs = ['all', 'red', 'yellow', 'green'].map(function(option) { return '<button type="button" class="status-tab ' + (state.pitStatus === option ? 'is-active' : '') + '" data-pit-status="' + option + '"><span class="status-dot ' + (option === 'all' ? '' : option) + '"></span>' + (option === 'all' ? 'All' : statusLabel(option)) + '<strong>' + counts[option] + '</strong></button>'; }).join('');
    var options = function(items, selected, label) { return '<option value="all">' + label + '</option>' + items.map(function(item) { return '<option value="' + escapeHtml(item) + '" ' + (item === selected ? 'selected' : '') + '>' + escapeHtml(item) + '</option>'; }).join(''); };
    var channelChoices = ['HQ', 'BP', 'WH', 'HQC', 'BPC'], allChannelsSelected = channelChoices.every(function(channel) { return selectedChannels.indexOf(channel) !== -1; });
    var channelButtons = '<button type="button" class="pit-channel-button ' + (allChannelsSelected ? 'is-active' : '') + '" data-pit-channel="all" aria-pressed="' + allChannelsSelected + '">All</button>' + channelChoices.map(function(channel) { var active = selectedChannels.indexOf(channel) !== -1; return '<button type="button" class="pit-channel-button ' + channelClass(channel) + ' ' + (active ? 'is-active' : '') + '" data-pit-channel="' + channel + '" aria-pressed="' + active + '">' + escapeHtml(channelLabel(channel)) + '</button>'; }).join('');
    var statusOptions = '<option value="all">All</option><option value="green" ' + (state.pitStatus === 'green' ? 'selected' : '') + '>On track</option><option value="yellow" ' + (state.pitStatus === 'yellow' ? 'selected' : '') + '>Watch</option><option value="red" ' + (state.pitStatus === 'red' ? 'selected' : '') + '>Action</option>';
    var sortOptions = [{ value: 'name', label: 'Name' }, { value: 'achievement', label: 'Achievement' }, { value: 'region', label: 'Region' }, { value: 'state', label: 'State' }].map(function(option) { return '<option value="' + option.value + '" ' + (state.pitArrange === option.value ? 'selected' : '') + '>' + option.label + '</option>'; }).join('');
    var rowHtml = function(pitstop) {
      var key = pitstop.channel + '::' + pitstop.name, channelClassName = channelClass(pitstop.channel), statusText = pitstop.status === 'green' ? 'On Track' : pitstop.status === 'yellow' ? 'Watch' : 'Action Required';
      return '<tr class="' + (state.selectedKey === key ? 'is-selected' : '') + '" data-pitstop-key="' + escapeHtml(key) + '"><td><span class="channel-badge ' + channelClassName + '">' + escapeHtml(channelLabel(pitstop.channel)) + '</span></td><td><strong>' + escapeHtml(pitstop.name) + '</strong></td><td>' + escapeHtml(pitstop.state) + '</td><td>' + escapeHtml(pitstop.region) + '</td><td>' + escapeHtml(pitstop.tier) + '</td><td>' + formatNumber(pitstop.target) + '</td><td><strong class="' + (pitstop.sales >= pitstop.target ? 'good' : 'bad') + '">' + formatNumber(pitstop.sales) + '</strong></td><td><strong class="' + (pitstop.variance >= 0 ? 'good' : 'bad') + '">' + (pitstop.variance >= 0 ? '+' : '') + formatNumber(pitstop.variance) + '</strong></td><td><div class="table-achievement"><strong class="' + (pitstop.achievement >= 100 ? 'good' : 'bad') + '">' + pitstop.achievement.toFixed(1) + '%</strong><div class="progress-track"><span class="progress-fill ' + statusClass(pitstop.status) + '" style="width:' + Math.min(pitstop.achievement, 100) + '%"></span></div></div></td><td><span class="status-badge ' + statusClass(pitstop.status) + '">' + statusText + '</span></td></tr>';
    };
    var rows = state.pitArrange === 'state' ? Array.from(new Set(filtered.map(function(pitstop) { return pitstop.state; }))).map(function(stateName) { var group = filtered.filter(function(pitstop) { return pitstop.state === stateName; }); return '<tr class="state-group-row"><th colspan="2" scope="rowgroup">' + escapeHtml(stateName) + '</th><th class="state-group-count">' + group.length + ' pitstop' + (group.length === 1 ? '' : 's') + '</th><td colspan="7" aria-hidden="true"></td></tr>' + group.map(rowHtml).join(''); }).join('') : filtered.map(rowHtml).join('');
    var shownSales = filtered.reduce(function(sum, pitstop) { return sum + pitstop.sales; }, 0), shownTarget = filtered.reduce(function(sum, pitstop) { return sum + pitstop.target; }, 0), shownAchievement = shownTarget ? (shownSales / shownTarget * 100).toFixed(1) : '0.0', actionRequired = filtered.filter(function(pitstop) { return pitstop.status === 'red'; }).length, watchCount = filtered.filter(function(pitstop) { return pitstop.status === 'yellow'; }).length, onTrackCount = filtered.filter(function(pitstop) { return pitstop.status === 'green'; }).length, lowest = filtered.slice().sort(function(a, b) { return a.achievement - b.achievement; })[0];
    var pitstopKpi = function(tone, label, value, detail) {
      var icon = tone === 'risk' ? '!' : label.slice(0, 1);
      var iconTone = tone === 'risk' ? 'red' : 'blue';
      return '<article class="kpi-card compact-kpi-card pitstop-kpi-card ' + tone + '"><div class="kpi-topline"><span class="kpi-icon ' + iconTone + '">' + escapeHtml(icon) + '</span><span class="pitstop-kpi-label kpi-label">' + label + '</span></div><strong class="pitstop-kpi-value kpi-value">' + value + '</strong><span class="pitstop-kpi-detail kpi-detail">' + detail + '</span></article>';
    };
    var pitstopKpis = '<div class="pitstop-kpi-grid">' + pitstopKpi('blue', 'Pitstops shown', formatNumber(filtered.length), formatNumber(onTrackCount) + ' on track · ' + formatNumber(watchCount) + ' watch · ' + formatNumber(actionRequired) + ' action') + pitstopKpi('blue', 'Sales', formatNumber(shownSales), 'Visible records') + pitstopKpi('blue', 'Target', formatNumber(shownTarget), 'Combined target') + pitstopKpi('risk', 'Achievement', shownAchievement + '%', formatNumber(shownSales) + ' of ' + formatNumber(shownTarget)) + pitstopKpi('risk', 'Action required', formatNumber(actionRequired), 'Click a row to inspect') + pitstopKpi('risk', 'Lowest achievement', lowest ? lowest.achievement.toFixed(1) + '%' : '—', lowest ? escapeHtml(lowest.name) : 'No matching records') + '</div>';
    var selected = pitstops.find(function(pitstop) { return pitstop.channel + '::' + pitstop.name === state.selectedKey; });
    var detail = selected ? '<aside class="panel detail-panel"><button type="button" class="close-button" data-close-detail="true" title="Close details" aria-label="Close details">x</button><span class="eyebrow">Selected location</span><h2>' + escapeHtml(selected.name) + '</h2><p class="detail-sub">' + escapeHtml(selected.region) + ' / ' + escapeHtml(selected.state) + ' / ' + escapeHtml(channelLabel(selected.channel)) + '</p><div class="detail-status ' + statusClass(selected.status) + '"><span class="status-dot"></span>' + statusLabel(selected.status) + '<strong>' + selected.achievement + '%</strong></div><div class="detail-stats"><div class="detail-stat"><span>Actual</span><strong>' + formatNumber(selected.sales) + '</strong></div><div class="detail-stat"><span>Target</span><strong>' + formatNumber(selected.target) + '</strong></div><div class="detail-stat"><span>Variance</span><strong class="' + (selected.variance >= 0 ? 'good' : 'bad') + '">' + (selected.variance >= 0 ? '+' : '') + formatNumber(selected.variance) + '</strong></div></div><div class="detail-callout"><div><strong>' + (selected.status === 'red' ? 'Action recommended' : selected.status === 'yellow' ? 'Monitor this location' : 'Performance is on track') + '</strong><p>' + (selected.status === 'red' ? 'The location is ' + formatNumber(Math.abs(selected.variance)) + ' units below target.' : selected.status === 'yellow' ? 'Keep this location on the daily watchlist.' : 'The location has met or exceeded its daily target.') + '</p></div></div><div class="detail-footer"><span>' + escapeHtml(selected.tier) + '</span><span>' + escapeHtml(channelLabel(selected.channel)) + '</span></div></aside>' : '';
    return '<section class="explorer-layout ' + (selected ? 'has-detail' : 'full-width') + '"><section class="panel"><div class="panel-header"><div><span class="eyebrow">Operational detail</span><h2>Pitstop explorer</h2><p>Selected period: ' + escapeHtml(formatRange(state.from, state.to)) + '. Sales and targets are accumulated per pitstop across the selected dates.' + escapeHtml(pitstopSourceNote) + '</p></div><span class="result-count">' + filtered.length + ' of ' + pitstops.length + ' locations</span></div>' + pitstopKpis + '<div class="status-tabs">' + statusTabs + '</div><div class="pit-filter"><div class="pit-filter-field pit-channel-field"><span>Channel</span><div class="pit-channel-toggle" role="group" aria-label="Filter by one or more channels">' + channelButtons + '</div></div><label class="pit-filter-field"><span>Region</span><select data-pit-region aria-label="Filter by region">' + options(regions, state.pitRegion, 'All regions') + '</select></label><label class="pit-filter-field"><span>State</span><select data-pit-state aria-label="Filter by state">' + options(states, state.pitState, 'All states') + '</select></label><label class="pit-filter-field"><span>Tier</span><select data-pit-tier aria-label="Filter by tier">' + options(tiers, state.pitTier, 'All') + '</select></label><label class="pit-filter-field"><span>Status</span><select data-pit-status-filter aria-label="Filter by status">' + statusOptions + '</select></label><label class="pit-filter-field pit-search-field"><span>Search</span><input type="search" value="' + escapeHtml(state.pitSearch) + '" data-pit-search placeholder="Pitstop name" aria-label="Search pitstops"></label><label class="pit-filter-field"><span>Sort</span><select data-pit-sort aria-label="Sort pitstops">' + sortOptions + '</select></label><button class="filter-reset" type="button" data-pit-reset>Reset</button></div><div class="table-scroll"><table class="data-table pitstop-table"><thead><tr><th>Channel</th><th>Pitstop</th><th>State</th><th>Region</th><th>Tier</th><th>Target</th><th>Sales</th><th>Variance</th><th>Achievement</th><th>Status</th></tr></thead><tbody>' + (rows || '<tr><td colspan="10"><div class="empty-state">No pitstops match these filters.</div></td></tr>') + '</tbody></table></div></section>' + detail + '</section>';
  }

  function renderBGarage() {
    var available = bgarageRowsInRange();
    var latestDate = available.reduce(function(latest, row) { return row.date > latest ? row.date : latest; }, '');
    // Aggregate daily rows per outlet for the selected report window. Daily
    // targets, sales, intake, referrals, and conversions are additive; MTD
    // values remain the latest cumulative snapshot in that window.
    var latestRows = aggregateBGarageRows(available).sort(function(a, b) { return a.outlet.localeCompare(b.outlet); });
    var search = state.bgarageSearch.trim().toLowerCase();
    var filtered = latestRows.filter(function(row) {
      var status = performanceStatus(row.dailyAchievement, row.dailyTarget, state.data.thresholds);
      return (state.bgarageStatus === 'all' || status === state.bgarageStatus) && (!search || row.outlet.toLowerCase().indexOf(search) !== -1);
    });
    var statuses = ['achieved', 'near', 'below', 'critical', 'na'];
    var counts = { all: latestRows.length };
    statuses.forEach(function(status) { counts[status] = latestRows.filter(function(row) { return performanceStatus(row.dailyAchievement, row.dailyTarget, state.data.thresholds) === status; }).length; });
    var statusTabs = ['all'].concat(statuses).map(function(status) {
      return '<button type="button" class="status-tab ' + (state.bgarageStatus === status ? 'is-active' : '') + '" data-bgarage-status="' + status + '"><span class="performance-dot ' + status + '"></span>' + (status === 'all' ? 'All outlets' : performanceLabel(status)) + '<strong>' + counts[status] + '</strong></button>';
    }).join('');
    var totalDailyTarget = filtered.reduce(function(sum, row) { return sum + (row.dailyTarget === null ? 0 : row.dailyTarget); }, 0);
    var totalDailyActual = filtered.reduce(function(sum, row) { return sum + (row.dailyActual === null ? 0 : row.dailyActual); }, 0);
    var totalMtd = filtered.reduce(function(sum, row) { return sum + (row.mtdActual === null ? 0 : row.mtdActual); }, 0);
    var totalMonthlyTarget = filtered.reduce(function(sum, row) { return sum + (row.monthlyTarget === null ? 0 : row.monthlyTarget); }, 0);
    var totalReferrals = filtered.reduce(function(sum, row) { return sum + row.referrals; }, 0);
    var totalConversions = filtered.reduce(function(sum, row) { return sum + row.conversions; }, 0);
    var totalIntake = filtered.reduce(function(sum, row) { return sum + (row.intakeActual === null ? 0 : row.intakeActual); }, 0);
    var totalIntakeTarget = filtered.reduce(function(sum, row) { return sum + (row.intakeTarget === null ? 0 : row.intakeTarget); }, 0);
    var salesRows = filtered.map(function(row) {
      var status = performanceStatus(row.dailyAchievement, row.dailyTarget, state.data.thresholds);
      return '<tr><td><strong>' + escapeHtml(row.outlet) + '</strong></td><td>' + formatBGarageMoney(row.dailyTarget) + '</td><td>' + formatBGarageMoney(row.dailyActual) + '</td><td class="performance-cell ' + status + '"><strong>' + formatAchievement(row.dailyAchievement) + '</strong></td><td class="performance-cell ' + status + '"><span class="performance-badge ' + status + '">' + performanceLabel(status) + '</span></td><td><strong>' + formatAchievement(row.mtdAchievement) + '</strong></td><td>' + formatBGarageMoney(row.mtdActual) + '</td><td>' + formatBGarageMoney(row.monthlyTarget) + '</td><td class="' + (row.shortfall === null ? '' : row.shortfall >= 0 ? 'good' : 'bad') + '">' + formatBGarageMoney(row.shortfall) + '</td></tr>';
    }).join('');
    var intakeRows = filtered.map(function(row) {
      var status = performanceStatus(row.intakeAchievement, row.intakeTarget, state.data.thresholds);
      var conversionRate = row.referrals ? Math.round(row.conversions / row.referrals * 100) : 0;
      return '<tr><td><strong>' + escapeHtml(row.outlet) + '</strong></td><td><strong>' + formatNumber(row.referrals) + '</strong></td><td><strong>' + formatNumber(row.conversions) + '</strong></td><td><strong>' + conversionRate + '%</strong></td><td><strong>' + formatNumber(row.pickDrop) + '</strong></td><td><strong>' + (row.intakeActual === null ? 'N/A' : formatNumber(row.intakeActual)) + '</strong></td><td><strong>' + (row.intakeTarget === null ? 'N/A' : formatNumber(row.intakeTarget)) + '</strong></td><td class="performance-cell ' + status + '"><strong>' + formatAchievement(row.intakeAchievement) + '</strong></td><td class="performance-cell ' + status + '"><span class="performance-badge ' + status + '">' + performanceLabel(status) + '</span></td></tr>';
    }).join('');
    var emptySales = '<tr><td colspan="9"><div class="empty-state">No BGarage outlets match these filters.</div></td></tr>';
    var emptyIntake = '<tr><td colspan="9"><div class="empty-state">No conversion or intake rows match these filters.</div></td></tr>';
    var noFilteredData = !filtered.length;
    var dailySalesValue = noFilteredData ? 'N/A' : formatMoney(totalDailyActual);
    var dailySalesDetail = noFilteredData ? 'No data in selected period' : '<strong>' + percentage(totalDailyActual, totalDailyTarget) + '%</strong> of ' + formatMoney(totalDailyTarget) + ' target';
    var mtdSalesValue = noFilteredData ? 'N/A' : formatMoney(totalMtd);
    var mtdSalesDetail = noFilteredData ? 'No data in selected period' : '<strong>' + percentage(totalMtd, totalMonthlyTarget) + '%</strong> of monthly target';
    var conversionValue = noFilteredData ? 'N/A' : formatNumber(totalConversions);
    var conversionDetail = noFilteredData ? 'No data in selected period' : '<strong>' + percentage(totalConversions, totalReferrals) + '%</strong> of referred cases';
    var intakeValue = noFilteredData ? 'N/A' : formatNumber(totalIntake);
    var intakeDetail = noFilteredData ? 'No data in selected period' : '<strong>' + percentage(totalIntake, totalIntakeTarget) + '%</strong> of ' + formatNumber(totalIntakeTarget) + ' target';
    return '<section class="bgarage-stack"><section class="kpi-grid bgarage-kpis">' +
      kpi('S', 'teal', 'Sales in period', dailySalesValue, dailySalesDetail) +
      kpi('M', 'blue', 'MTD sales', mtdSalesValue, mtdSalesDetail) +
      kpi('C', 'amber', 'Conversions', conversionValue, conversionDetail) +
      kpi('I', 'red', 'Intake in period', intakeValue, intakeDetail) +
      '</section><article class="panel bgarage-panel bgarage-sales-panel"><div class="panel-header"><div><span class="eyebrow">BGarage network</span><h2>Sales performance</h2><p>Selected period: ' + escapeHtml(formatRange(state.from, state.to)) + '. Status is calculated from aggregated daily achievement.</p></div><span class="result-count">' + filtered.length + ' of ' + latestRows.length + ' outlets</span></div>' + bgaragePeriodNote() + '<div class="status-tabs">' + statusTabs + '</div><div class="bgarage-filter"><label class="search-field">Search<input type="search" value="' + escapeHtml(state.bgarageSearch) + '" data-bgarage-search placeholder="Outlet name" aria-label="Search BGarage outlets"></label><div class="classification-note"><span><i class="performance-dot achieved"></i>100%+</span><span><i class="performance-dot near"></i>80-99%</span><span><i class="performance-dot below"></i>60-79%</span><span><i class="performance-dot critical"></i>&lt;60%</span></div></div><div class="table-scroll"><table class="data-table bgarage-table"><thead><tr><th>BGarage outlet</th><th>Period target</th><th>Period actual</th><th>Period achievement</th><th>Sales status</th><th>MTD achievement</th><th>MTD actual</th><th>Monthly target</th><th>MTD shortfall</th></tr></thead><tbody>' + (salesRows || emptySales) + '</tbody></table></div></article><article class="panel bgarage-panel bgarage-intake-panel"><div class="panel-header"><div><span class="eyebrow">Conversion and intake</span><h2>Lead handling performance</h2><p>Referral conversion, pick and drop cases, and daily intake aggregated across the selected period.</p></div></div><div class="table-scroll"><table class="data-table bgarage-table"><thead><tr><th>BGarage outlet</th><th>Cases referred</th><th>Conversions</th><th>Conversion rate</th><th>Pick and drop</th><th>Period intake</th><th>Period target</th><th>Intake achievement</th><th>Intake status</th></tr></thead><tbody>' + (intakeRows || emptyIntake) + '</tbody></table></div></article></section>';
  }

  function manualIndonesiaRowsForWindow(from, to) {
    var rows = [];
    Object.keys(state.manualIndonesiaSummaryValues || {}).forEach(function(date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (from && date < from) || (to && date > to)) return;
      var daily = (state.manualIndonesiaSummaryValues[date] || {}).daily || {};
      if (!String(daily.pitstop || '').trim()) return;
      rows.push(manualIndonesiaDailyRow(date, daily));
    });
    return rows;
  }
  function manualIndonesiaDailyRow(date, daily) {
    return { date: date, pitstop: String(daily.pitstop || 'Cengkareng').trim(), totalLead: numberValue(daily.totalLead), pendingLead: numberValue(daily.pendingLead), cancelledLead: numberValue(daily.cancelledLead), baterikuJumpstart: numberValue(daily.baterikuJumpstart), baterikuCharge: numberValue(daily.baterikuCharge), baterikuWarranty: numberValue(daily.baterikuWarranty), baterikuBattery: numberValue(daily.baterikuBattery), partnerJumpstart: numberValue(daily.partnerJumpstart), partnerBattery: numberValue(daily.partnerBattery) };
  }
  function indonesiaRowsForWindow(from, to) {
    var manualRows = manualIndonesiaRowsForWindow(from, to), manualDates = {};
    manualRows.forEach(function(row) { manualDates[row.date] = true; });
    return (state.data.indonesia || []).filter(function(row) { return !!row.date && (!from || row.date >= from) && (!to || row.date <= to) && !manualDates[row.date]; }).concat(manualRows).sort(function(left, right) { return left.date.localeCompare(right.date) || left.pitstop.localeCompare(right.pitstop); });
  }
  function indonesiaRowsInRange() { return indonesiaRowsForWindow(state.from, state.to); }

  function manualIndonesiaCumulativeForReportDate(reportDate, dailyOverride) {
    if (!reportDate) return { pitstop: 'Cengkareng', totalLead: 0, pendingLead: 0, cancelledLead: 0, baterikuJumpstart: 0, baterikuCharge: 0, baterikuWarranty: 0, baterikuBattery: 0, partnerJumpstart: 0, partnerBattery: 0 };
    var monthStart = reportDate.slice(0, 7) + '-01', rows = indonesiaRowsForWindow(monthStart, reportDate), storedDaily = (state.manualIndonesiaSummaryValues[reportDate] || {}).daily || {}, selectedDaily = dailyOverride || storedDaily, pitstop = String(selectedDaily.pitstop || (rows.length ? rows[rows.length - 1].pitstop : 'Cengkareng')).trim() || 'Cengkareng', pitstopKey = pitstop.toUpperCase();
    if (dailyOverride) rows = rows.filter(function(row) { return row.date !== reportDate || String(row.pitstop || '').toUpperCase() !== pitstopKey; }).concat([manualIndonesiaDailyRow(reportDate, dailyOverride)]);
    var matchingRows = rows.filter(function(row) { return String(row.pitstop || '').toUpperCase() === pitstopKey; }), result = { pitstop: pitstop, totalLead: 0, pendingLead: 0, cancelledLead: 0, baterikuJumpstart: 0, baterikuCharge: 0, baterikuWarranty: 0, baterikuBattery: 0, partnerJumpstart: 0, partnerBattery: 0 };
    matchingRows.forEach(function(row) { ['totalLead', 'pendingLead', 'cancelledLead', 'baterikuJumpstart', 'baterikuCharge', 'baterikuWarranty', 'baterikuBattery', 'partnerJumpstart', 'partnerBattery'].forEach(function(field) { result[field] += numberValue(row[field]); }); });
    return result;
  }

  function indonesiaSales(row) { return row.baterikuJumpstart + row.baterikuBattery + row.partnerJumpstart + row.partnerBattery; }
  function indonesiaJumpstart(row) { return row.baterikuJumpstart + row.partnerJumpstart; }
  function indonesiaBattery(row) { return row.baterikuBattery + row.partnerBattery; }
  function indonesiaRate(value, leads) { return leads ? (value / leads * 100).toFixed(1) + '%' : '0.0%'; }
  function indonesiaSum(rows, key) { return rows.reduce(function(sum, row) { return sum + numberValue(row[key]); }, 0); }

  function indonesiaGroupedRows(rows) {
    var groups = {};
    (rows || []).forEach(function(row) {
      var key = row.pitstop.toUpperCase();
      if (!groups[key]) groups[key] = { pitstop: row.pitstop, totalLead: 0, pendingLead: 0, cancelledLead: 0, baterikuJumpstart: 0, baterikuCharge: 0, baterikuWarranty: 0, baterikuBattery: 0, partnerJumpstart: 0, partnerBattery: 0 };
      var group = groups[key];
      ['totalLead', 'pendingLead', 'cancelledLead', 'baterikuJumpstart', 'baterikuCharge', 'baterikuWarranty', 'baterikuBattery', 'partnerJumpstart', 'partnerBattery'].forEach(function(field) { group[field] += numberValue(row[field]); });
    });
    return Object.keys(groups).map(function(key) { return groups[key]; }).sort(function(a, b) { return a.pitstop.localeCompare(b.pitstop); });
  }

  function indonesiaTableRow(row, includeDate) {
    var lead = row.totalLead, jumpstart = indonesiaJumpstart(row), battery = indonesiaBattery(row), total = jumpstart + battery;
    return '<tr>' + (includeDate ? '<td><strong>' + escapeHtml(formatSummaryDate(row.date)) + '</strong></td>' : '') + '<td><strong>' + escapeHtml(row.pitstop) + '</strong></td><td>' + formatNumber(row.totalLead) + '</td><td>' + formatNumber(row.pendingLead) + '</td><td>' + formatNumber(row.cancelledLead) + '</td><td>' + formatNumber(row.baterikuJumpstart) + '</td><td>' + formatNumber(row.baterikuCharge) + '</td><td>' + formatNumber(row.baterikuWarranty) + '</td><td>' + formatNumber(row.baterikuBattery) + '</td><td>' + formatNumber(row.partnerJumpstart) + '</td><td>' + formatNumber(row.partnerBattery) + '</td><td><strong>' + formatNumber(total) + '</strong></td><td>' + indonesiaRate(jumpstart, lead) + '</td><td>' + indonesiaRate(battery, lead) + '</td></tr>';
  }

  function indonesiaTableHeader(includeDate) {
    return '<thead><tr>' + (includeDate ? '<th rowspan="2">Date</th>' : '') + '<th rowspan="2">Pitstop</th><th rowspan="2">Total lead</th><th rowspan="2">Pending lead</th><th rowspan="2">Cancelled lead</th><th colspan="4">Bateriku sales</th><th colspan="2">Partner sales</th><th colspan="3">Total daily sales</th></tr><tr><th>Jumpstart</th><th>Charge</th><th>Warranty</th><th>Battery</th><th>Jumpstart</th><th>Battery</th><th>Units</th><th>Jumpstart %</th><th>Battery %</th></tr></thead>';
  }

  function renderIndonesia() {
    var rows = indonesiaRowsInRange(), latestDate = rows.length ? rows[rows.length - 1].date : '', latestRows = latestDate ? rows.filter(function(row) { return row.date === latestDate; }) : [], latestLeads = indonesiaSum(latestRows, 'totalLead'), latestSales = latestRows.reduce(function(sum, row) { return sum + indonesiaSales(row); }, 0), monthKey = latestDate ? latestDate.slice(0, 7) : '', monthRows = monthKey ? indonesiaRowsForWindow(monthKey + '-01', latestDate) : [], monthGroups = indonesiaGroupedRows(monthRows), monthLeads = indonesiaSum(monthRows, 'totalLead'), monthSales = monthRows.reduce(function(sum, row) { return sum + indonesiaSales(row); }, 0);
    var dailyBody = rows.map(function(row) { return indonesiaTableRow(row, true); }).join('');
    var cumulativeBody = monthGroups.map(function(row) { return indonesiaTableRow(row, false); }).join('');
    var emptyDaily = '<tr><td colspan="14"><div class="empty-state">No Indonesia rows match the selected report window. Enter and save the daily values in Summary &gt; Indonesia.</div></td></tr>';
    var emptyCumulative = '<tr><td colspan="13"><div class="empty-state">No month-to-date Indonesia rows are available.</div></td></tr>';
    var latestLabel = latestDate ? formatSummaryDate(latestDate) : 'No date loaded';
    return '<section class="indonesia-dashboard"><section class="kpi-grid indonesia-kpis">' + kpi('I', 'teal', 'Latest day sales', formatNumber(latestSales), latestDate ? escapeHtml(latestLabel) + ' · Jumpstart ' + formatNumber(indonesiaSum(latestRows, 'baterikuJumpstart') + indonesiaSum(latestRows, 'partnerJumpstart')) + ' · Battery ' + formatNumber(indonesiaSum(latestRows, 'baterikuBattery') + indonesiaSum(latestRows, 'partnerBattery')) : 'Enter data in Summary > Indonesia') + kpi('L', 'blue', 'Latest day leads', formatNumber(latestLeads), latestDate ? escapeHtml(latestLabel) : 'Awaiting saved Summary data') + kpi('%', 'amber', 'Latest conversion', indonesiaRate(latestSales, latestLeads), 'Total daily sales ÷ total leads') + kpi('M', 'green', 'Month-to-date sales', formatNumber(monthSales), monthKey ? escapeHtml(formatSummaryDate(monthKey + '-01')) + ' to ' + escapeHtml(latestLabel) : 'Awaiting saved Summary data') + '</section><article class="panel indonesia-intro"><div class="panel-header"><div><span class="eyebrow">Bateriku Indonesia</span><h2>Indonesia sales &amp; performance</h2><p>Saved values from Summary &gt; Indonesia are shown here. Month-to-date totals are calculated from the daily records.</p></div><span class="result-count">' + rows.length + ' rows in window</span></div><div class="indonesia-note"><strong>Data source:</strong> enter and save daily values in <strong>Summary &gt; Indonesia</strong>. This tab reflects the same saved daily records.</div></article><article class="panel indonesia-table-panel"><div class="panel-header"><div><span class="eyebrow">Daily performance summary</span><h2>Daily sales report</h2><p>Selected report window' + (latestDate ? ' · latest day ' + escapeHtml(latestLabel) : '') + '</p></div><span class="result-count">' + rows.length + ' daily rows</span></div><div class="table-scroll"><table class="data-table indonesia-table">' + indonesiaTableHeader(true) + '<tbody>' + (dailyBody || emptyDaily) + '</tbody></table></div></article><article class="panel indonesia-table-panel"><div class="panel-header"><div><span class="eyebrow">Cumulative ' + (monthKey ? escapeHtml(new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(monthKey + '-01T00:00:00Z'))) : 'month') + ' summary</span><h2>Month-to-date sales</h2><p>Calculated from all Indonesia daily rows in the selected month through ' + escapeHtml(latestLabel) + '.</p></div><span class="result-count">' + formatNumber(monthGroups.length) + ' pitstops</span></div><div class="table-scroll"><table class="data-table indonesia-table">' + indonesiaTableHeader(false) + '<tbody>' + (cumulativeBody || emptyCumulative) + '</tbody></table></div><div class="indonesia-total"><span>Total month-to-date leads <strong>' + formatNumber(monthLeads) + '</strong></span><span>Total month-to-date sales <strong>' + formatNumber(monthSales) + '</strong></span><span>Conversion rate <strong>' + indonesiaRate(monthSales, monthLeads) + '</strong></span></div></article></section>';
  }

  function specialStatusSummary(rows) {
    return (rows || []).reduce(function(summary, row) {
      summary[row.status] = (summary[row.status] || 0) + 1;
      summary.total += 1;
      summary.sales += numberValue(row.sales);
      summary.target += numberValue(row.target);
      return summary;
    }, { green: 0, yellow: 0, red: 0, total: 0, sales: 0, target: 0 });
  }

  function specialStatusCells(summary) {
    return '<td class="special-status-number red">' + formatNumber(summary.red) + '</td><td class="special-status-number yellow">' + formatNumber(summary.yellow) + '</td><td class="special-status-number green">' + formatNumber(summary.green) + '</td><td><strong>' + formatNumber(summary.total) + '</strong></td>';
  }

  // The CEO/email summary follows the operational sequence used in the
  // source report, not alphabetical order. Pitstop Master remains the single
  // source of truth for the order within each state, so newly added branches
  // can join the report without maintaining a second hard-coded name list.
  var SUMMARY_STATE_ORDER = {
    // Keep the CEO/email sequence exactly as supplied. States that are not
    // present in this list (for example Putrajaya or Perlis when available)
    // are appended after it by summaryStateRank so they remain visible.
    hq: ['JOHOR', 'MELAKA', 'N.SEMBILAN', 'PUTRAJAYA', 'KUALA LUMPUR', 'SELANGOR', 'PERAK', 'PENANG', 'KEDAH', 'PERLIS', 'KELANTAN', 'TERENGGANU', 'PAHANG', 'SABAH', 'SARAWAK'],
    bp: ['JOHOR', 'MELAKA', 'N.SEMBILAN', 'PUTRAJAYA', 'KUALA LUMPUR', 'SELANGOR', 'PERAK', 'PENANG', 'KEDAH', 'KELANTAN', 'TERENGGANU', 'PAHANG', 'SABAH', 'SARAWAK']
  };
  REPORT_MAPPING_REGISTRY.summary.stateOrder = SUMMARY_STATE_ORDER;
  var SUMMARY_PITSTOP_ORDER = {
    hq: [
      'HQ PERLING', 'HQ MUTIARA RINI', 'HQ MUAR', 'HQ JB CITY', 'HQ MOUNT AUSTIN', 'HQ PERMAS JAYA', 'HQ BATU PAHAT', 'WH YONG PENG', 'HQ BANDAR PONTIAN', 'HQ SIMPANG RENGGAM', 'HQ TANGKAK', 'HQ PASIR GUDANG', 'HQ KOTA MASAI', 'HQ PARIT RAJA', 'WH INDAHPURA KULAI', 'HQ TAMAN PULAI MUTIARA',
      'HQ MELAKA', 'HQ BANDAR MELAKA', 'HQ SUNGAI UDANG',
      'HQ SEREMBAN 2', 'HQ SIKAMAT', 'HQ MANTIN', 'HQ NILAI 3', 'HQ SENAWANG', 'HQ SENDAYAN',
      'HQ PRESINT 15 PUTRAJAYA',
      'HQ PUDU', 'HQ JALAN IPOH', 'HQ TRILIUM SUNGAI BESI', 'HQ TAMAN MELAWATI', 'HQ KEPONG', 'HQ JALAN GENTING KELANG', 'HQ SUNGAI PENCHALA', 'HQ SETAPAK', 'HQ PERMAISURI CHERAS', 'HQ SETIAWANGSA', 'HQ DESA PANDAN', 'HQ BANGSAR',
      'HQ BALAKONG', 'HQ KELANA JAYA', 'HQ TAMAN MEDAN', 'WH KAJANG SG CHUA', 'HQ SS19', 'HQ COUNTRY HOMES RAWANG', 'HQ DENAI ALAM', 'HQ TAMAN TELUK PULAI', 'HQ TAMAN SRI MUDA', 'HQ SRI SERDANG', 'HQ SEKSYEN 32', 'HQ SUBANG PERDANA', 'HQ DAMANSARA DAMAI', 'HQ ECO MAJESTIC', 'HQ KAPAR', 'HQ TAMAN SETIA RAWANG', 'HQ KOTA BAYUEMAS', 'HQ JENJAROM', 'HQ DATARAN SURIA', 'HQ BANDAR SERI PUTRA', 'HQ AMPANG', 'HQ BANDAR BUKIT RAJA', 'HQ UKAY PERDANA', 'HQ IJOK', 'HQ SEKSYEN 7', 'HQ TTDI JAYA WALK-IN CENTRE', 'HQ KAJANG TAMAN SRI JENARIS', 'HQ KINRARA', 'HQ PELANGI DAMANSARA', 'HQ GOMBAK', 'HQ DENGKIL', 'HQ EQUINE PARK', 'HQ MERU', 'HQ SAUJANA UTAMA', 'HQ PUTRA PERDANA', 'HQ KLIA AVENUE',
      'WH IPOH', 'HQ SITIAWAN', 'HQ TELUK INTAN', 'HQ SILIBIN IPOH',
      'HQ GEORGETOWN', 'HQ BUKIT MINYAK', 'WH BUTTERWORTH', 'HQ ILP PERAI', 'HQ BALIK PULAU', 'HQ KEPALA BATAS', 'HQ KUBANG SEMANG', 'HQ SUNGAI NIBONG', 'HQ PULAU PINANG', 'HQ SEBERANG JAYA', 'HQ RELAU', 'HQ BATU KAWAN',
      'HQ TAMAN SEJATI INDAH', 'HQ TAMAN DATUK KUMBAR', 'WH SUNGAI PETANI', 'HQ BANDAR PUTERI JAYA', 'HQ LANGKAWI', 'HQ POKOK SENA',
      'HQ WAKAF SIKU KOTA BHARU', 'WH PENGKALAN CHEPA', 'HQ BANDAR PASIR MAS', 'HQ KUALA KRAI', 'HQ KETEREH', 'HQ TUMPAT', 'HQ TANAH MERAH',
      'HQ BATU 6, KUALA TERENGGANU', 'HQ BESUT', 'WH GONG BADAK', 'HQ PADANG MIDIN, KUALA TERENGGANU', 'HQ KERTEH',
      'WH INDERA MAHKOTA', 'HQ BUKIT RANGIN', 'HQ BESERAH', 'HQ SUNGAI KARANG', 'HQ CHENDOR', 'HQ KUANTAN', 'HQ BUKIT SEMANTAN TEMERLOH', 'HQ KEMPADANG', 'HQ TAMAN GURU',
      'HQ PENAMPANG', 'HQ TAWAU', 'HQ KOTA KINABALU', 'HQ LIKAS',
      'HQ KOTA SAMARAHAN', 'HQ KOTA SENTOSA', 'HQ MATANG KUCHING'
    ],
    bp: [
      'BP JOHOR JAYA', 'BP ULU TIRAM', 'BP TAMPOI', 'BP KLUANG', 'BP SKUDAI', 'BP KG MELAYU MAJIDEE', 'BP BANDAR DATO ONN', 'BP BANDAR PUTRA KULAI', 'BP KOTA TINGGI', 'BP TAMAN AMANSARI MUAR', 'BP TAMAN DELIMA, KLUANG', 'BP KONG KONG', 'BP GELANG PATAH', 'BP TAMAN YAYASAN, SEGAMAT', 'BP BUKIT GAMBIR TANGKAK', 'BP LABIS', 'BP MERSING', 'BP JALAN JOHOR-PONTIAN', 'BP SRI MEDAN', 'BP BANDAR PENAWAR', 'BP JALAN GENUANG, SEGAMAT', 'BP KELAPA SAWIT', 'BP KLUANG 2',
      'BP ALOR GAJAH', 'BP MASJID TANAH', 'BP MERLIMAU', 'BP JASIN',
      'BP NILAI', 'BP PORT DICKSON', 'BP KUALA PILAH', 'BP GEMAS', 'BP BAHAU', 'BP REMBAU', 'BP TAMPIN',
      'BP PUTRAJAYA',
      'BP KERAMAT', 'BP CHERAS',
      'BP PUCHONG', 'BP SEMENYIH', 'BP SUNGAI BULOH', 'BP BANDAR RIMBAYU', 'BP BANGI', 'BP BANDAR BOTANIC', 'BP TELOK PANGLIMA GARANG', 'BP BUKIT BERUNTUNG RAWANG', 'BP BATANG KALI', 'BP PORT KLANG', 'BP PUNCAK ALAM', 'BP CYBERJAYA', 'BP HULU LANGAT', 'BP TANJUNG KARANG', 'BP SUNGAI PELEK', 'BP BUKIT BERUNTUNG ADENIUM', 'BP KUALA SELANGOR', 'BP BANTING', 'BP SABAK BERNAM',
      'BP IPOH', 'BP STATION 18', 'BP TAIPING', 'BP KAMUNTING', 'BP SERI ISKANDAR 2', 'BP MERU, IPOH', 'BP TELUK INTAN (JLN CHANGKAT JONG)', 'BP TAMBUN', 'BP BATU GAJAH', 'BP MANJUNG', 'BP SIMPANG', 'BP KUALA KANGSAR', 'BP SERI ISKANDAR', 'BP AYER TAWAR', 'BP KAMPAR', 'BP BAGAN SERAI', 'BP PANTAI REMIS', 'BP SUNGKAI', 'BP TAPAH', 'BP GERIK', 'BP SLIM RIVER', 'BP PARIT BUNTAR', 'BP TANJUNG MALIM', 'BP SUNGAI SIPUT',
      'BP AYER ITAM', 'BP SIMPANG AMPAT', 'BP JAWI', 'BP BAGAN AJAM', 'BP BERTAM', 'BP BUKIT MERTAJAM', 'BP PENAGA', 'BP ARA KUDA', 'BP TELUK KUMBAR', 'BP SUNGAI DUA',
      'BP TAMAN RIA SUNGAI PETANI', 'BP TAMAN PANDAN', 'BP PEKAN SUNGAI PETANI', 'BP ALOR SETAR', 'BP KULIM', 'BP JITRA', 'BP KELANG LAMA , KULIM', 'BP GURUN', 'BP PADANG SERAI', 'BP BALING', 'BP KUALA KETIL', 'BP GUAR CHEMPEDAK', 'BP BEDONG', 'BP MERBOK', 'BP CHANGLOON', 'BP LUNAS', 'BP PENDANG',
      'BP KANGAR', 'BP PADANG BESAR', 'BP ARAU',
      'BP KUBANG KERIAN', 'BP GUA MUSANG', 'BP BACHOK', 'BP PASIR PUTEH', 'BP PASIR MAS', 'BP BUKIT BUNGA',
      'BP KUALA TERENGGANU 3', 'BP KEMAMAN', 'BP DUNGUN', 'BP KUALA BERANG', 'BP MARANG', 'BP SETIU', 'BP JERTEH', 'BP PAKA', 'BP BINJAI KEMAMAN',
      'BP TEMERLOH', 'BP JERANTUT', 'BP JENGKA', 'BP BERA', 'BP KAMPUNG PADANG', 'BP KUALA LIPIS', 'BP MENTAKAB', 'BP CAMERON HIGHLAND', 'BP PEKAN', 'BP MARAN', 'BP GAMBANG', 'BP BENTONG', 'BP BALOK', 'BP RAUB', 'BP ROMPIN',
      'BP TAMAN BDC KUCHING'
    ]
  };
  REPORT_MAPPING_REGISTRY.summary.pitstopOrder = SUMMARY_PITSTOP_ORDER;
  var SUMMARY_REGION_ORDER = REPORT_MAPPING_REGISTRY.summary.regionOrder;

  function summaryNetworkKey(label, rows) {
    var normalized = String(label || '').toUpperCase();
    if (normalized === 'BP' || normalized.indexOf('B2B2C') !== -1) return 'bp';
    if (normalized === 'HQ' || normalized.indexOf('B2C') !== -1) return 'hq';
    return (rows || []).some(function(row) { return canonicalChannel(row.channel) === 'BP'; }) ? 'bp' : 'hq';
  }

  function summaryStateRank(value, networkKey) {
    var normalized = cleanKey(canonicalState(value)), order = SUMMARY_STATE_ORDER[networkKey] || SUMMARY_STATE_ORDER.hq;
    // Rank canonical state keys, not their display spelling. This keeps
    // variants such as "N. Sembilan"/"N.SEMBILAN" and "Penang"/"P.PINANG"
    // together while preserving the original label in the rendered table.
    var orderKeys = order.map(function(item) { return cleanKey(canonicalState(item)); });
    var index = orderKeys.indexOf(normalized);
    return index === -1 ? order.length : index;
  }

  function summaryOrderedGroupNames(groups, networkKey) {
    return Object.keys(groups || {}).sort(function(a, b) {
      return summaryStateRank(a, networkKey) - summaryStateRank(b, networkKey) || a.localeCompare(b);
    });
  }

  function summaryOrderedRegions(regions) {
    return Object.keys(regions || {}).sort(function(a, b) {
      var aIndex = SUMMARY_REGION_ORDER.indexOf(String(a).toUpperCase()), bIndex = SUMMARY_REGION_ORDER.indexOf(String(b).toUpperCase());
      if (aIndex === -1) aIndex = SUMMARY_REGION_ORDER.length;
      if (bIndex === -1) bIndex = SUMMARY_REGION_ORDER.length;
      return aIndex - bIndex || a.localeCompare(b);
    });
  }

  function summaryOrderedPitstops(rows, label) {
    var networkKey = summaryNetworkKey(label, rows), fixedRank = {}, masterRank = {};
    (SUMMARY_PITSTOP_ORDER[networkKey] || []).forEach(function(name, index) {
      pitstopMatchKeys(name).forEach(function(key) { if (fixedRank[key] === undefined) fixedRank[key] = index; });
    });
    (state.data.pitstopMaster || []).forEach(function(master, index) {
      var masterNetwork = canonicalChannel(master.channel) === 'BP' || canonicalChannel(master.channel) === 'BPC' ? 'bp' : 'hq';
      if (masterNetwork !== networkKey) return;
      pitstopMatchKeys(master.name).forEach(function(key) { if (masterRank[key] === undefined) masterRank[key] = index; });
    });
    function rowRank(row) {
      var fixed = Number.MAX_SAFE_INTEGER, master = Number.MAX_SAFE_INTEGER;
      pitstopMatchKeys(row.name).some(function(key) { if (fixedRank[key] !== undefined) { fixed = fixedRank[key]; return true; } return false; });
      pitstopMatchKeys(row.name).some(function(key) { if (masterRank[key] !== undefined) { master = masterRank[key]; return true; } return false; });
      return { fixed: fixed, master: master };
    }
    return (rows || []).slice().sort(function(a, b) {
      var stateDifference = summaryStateRank(a.state, networkKey) - summaryStateRank(b.state, networkKey);
      if (stateDifference) return stateDifference;
      var aRank = rowRank(a), bRank = rowRank(b);
      var orderDifference = aRank.fixed - bRank.fixed || aRank.master - bRank.master;
      return orderDifference || String(a.name).localeCompare(String(b.name));
    });
  }

  function specialStateRows(rows, label) {
    var groups = {};
    (rows || []).forEach(function(row) {
      var key = row.state || 'Unassigned';
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });
    return summaryOrderedGroupNames(groups, summaryNetworkKey(label, rows)).map(function(stateName) {
      return '<tr><th scope="row">' + escapeHtml(stateName) + '</th>' + specialStatusCells(specialStatusSummary(groups[stateName])) + '</tr>';
    }).join('');
  }

  function specialTierRegionRows(rows) {
    var regions = {}, tiers = ['Tier 1', 'Tier 2', 'Tier 3'];
    (rows || []).forEach(function(row) {
      var region = row.region || 'Unassigned', tier = tiers.indexOf(row.tier) !== -1 ? row.tier : 'Other';
      if (!regions[region]) regions[region] = { all: [] };
      if (!regions[region][tier]) regions[region][tier] = [];
      regions[region][tier].push(row);
      regions[region].all.push(row);
    });
    return summaryOrderedRegions(regions).map(function(region) {
      return tiers.map(function(tier, index) {
        var summary = specialStatusSummary(regions[region][tier] || []);
        return '<tr>' + (index === 0 ? '<th class="special-region-name" scope="rowgroup" rowspan="3">' + escapeHtml(region) + '</th>' : '') + '<th class="special-tier-name" scope="row">' + escapeHtml(tier) + '</th>' + specialStatusCells(summary) + '</tr>';
      }).join('');
    }).join('');
  }

  function specialNetworkPanel(label, rows) {
    var summary = specialStatusSummary(rows);
    return '<article class="panel special-summary-panel"><div class="panel-header"><div><span class="eyebrow">' + escapeHtml(label) + ' network</span><h2>State achievement summary</h2><p>Green met target; yellow is within 10% or at most 1 unit short; red is below both limits.</p></div><span class="result-count">' + formatNumber(summary.total) + ' pitstops</span></div><div class="table-scroll"><table class="data-table special-status-table"><thead><tr><th>State</th><th class="red">Red</th><th class="yellow">Yellow</th><th class="green">Green</th><th>Total</th></tr></thead><tbody>' + (specialStateRows(rows, label) || '<tr><td colspan="5"><div class="empty-state">No state results are available.</div></td></tr>') + '<tr class="total-row"><th>Grand total</th>' + specialStatusCells(summary) + '</tr></tbody></table></div></article>';
  }

  function specialTierPanel(label, rows) {
    var summary = specialStatusSummary(rows);
    return '<article class="panel special-summary-panel"><div class="panel-header"><div><span class="eyebrow">' + escapeHtml(label) + ' network</span><h2>Tier summary by region</h2><p>Achievement status for Tier 1, Tier 2, and Tier 3 in every region.</p></div><span class="result-count">' + formatNumber(summary.total) + ' pitstops</span></div><div class="table-scroll"><table class="data-table special-status-table special-tier-table"><colgroup><col class="special-col-region"><col class="special-col-tier"><col class="special-col-status" span="4"></colgroup><thead><tr><th>Region</th><th>Tier</th><th class="red">Red</th><th class="yellow">Yellow</th><th class="green">Green</th><th>Total</th></tr></thead><tbody>' + (specialTierRegionRows(rows) || '<tr><td colspan="6"><div class="empty-state">No tier results are available.</div></td></tr>') + '<tr class="total-row"><th colspan="2">Grand total</th>' + specialStatusCells(summary) + '</tr></tbody></table></div></article>';
  }

  function specialPitstopDetails(rows, label) {
    var sortedRows = summaryOrderedPitstops(rows, label);
    var states = Array.from(new Set(sortedRows.map(function(row) { return row.state; })));
    var body = states.map(function(stateName) {
      var stateRows = sortedRows.filter(function(row) { return row.state === stateName; });
      var heading = '<tr class="special-state-heading"><th colspan="7" scope="rowgroup">' + escapeHtml(stateName) + '</th><th>' + formatNumber(stateRows.length) + ' pitstop' + (stateRows.length === 1 ? '' : 's') + '</th></tr>';
      var detailRows = stateRows.map(function(row, index) {
        var achievementLabel = row.status === 'green' ? 'Green' : row.status === 'yellow' ? 'Yellow' : 'Red';
        return '<tr><td class="special-row-number">' + (index + 1) + '</td><td><strong>' + escapeHtml(row.name) + '</strong></td><td>' + escapeHtml(row.region) + '</td><td>' + escapeHtml(row.state) + '</td><td>' + escapeHtml(row.tier) + '</td><td>' + formatNumber(row.target) + '</td><td><strong>' + formatNumber(row.sales) + '</strong></td><td><span class="special-achievement-indicator ' + statusClass(row.status) + '"><i aria-hidden="true"></i><span>' + achievementLabel + '</span></span></td></tr>';
      }).join('');
      return heading + detailRows;
    }).join('');
    return '<details class="panel special-detail-panel"><summary><span><strong>' + escapeHtml(label) + ' state details</strong><small>Complete state-by-state location results</small></span><span>' + formatNumber((rows || []).length) + ' pitstops</span></summary><div class="table-scroll"><table class="data-table special-detail-table"><thead><tr><th>No.</th><th>Name</th><th>Region</th><th>State</th><th>Tier</th><th>Target</th><th>Total sales</th><th>Achievement</th></tr></thead><tbody>' + (body || '<tr><td colspan="8"><div class="empty-state">No pitstop data is available for this selection.</div></td></tr>') + '</tbody></table></div></details>';
  }

  function renderSpecialReport() {
    var salesRows = rowsInRange(), specialChannel = ['all', 'hq', 'bp'].indexOf(state.specialChannel) !== -1 ? state.specialChannel : 'all', specialChannelLabel = specialChannel === 'all' ? 'HQ and BP' : dailyDetailLabel(specialChannel);
    var latest = salesRows[salesRows.length - 1], previous = salesRows[salesRows.length - 2];
    var periodSales = salesRows.reduce(function(sum, row) { return sum + salesTotalForChannel(row, specialChannel); }, 0), latestTotal = latest ? salesTotalForChannel(latest, specialChannel) : 0, priorTotal = previous ? salesTotalForChannel(previous, specialChannel) : null;
    var latestDelta = priorTotal === null ? null : latestTotal - priorTotal, movingWindow = salesRows.slice(-3), movingAverage = movingWindow.length ? movingWindow.reduce(function(sum, row) { return sum + salesTotalForChannel(row, specialChannel); }, 0) / movingWindow.length : 0;
    var pitstops = pitstopsForPeriod().filter(function(row) { return row.channel !== 'HQC' && row.channel !== 'BPC' && (specialChannel === 'all' || (specialChannel === 'hq' ? row.channel === 'HQ' || row.channel === 'WH' : row.channel === 'BP')); });
    var hqPitstops = pitstops.filter(function(row) { return row.channel === 'HQ' || row.channel === 'WH'; }), bpPitstops = pitstops.filter(function(row) { return row.channel === 'BP'; });
    var networkSummary = specialStatusSummary(pitstops), serviceTotal = salesRows.reduce(function(sum, row) { return sum + totalServices(row) + totalWarranty(row); }, 0);
    var bgarageRows = aggregateBGarageRows(bgarageRowsForPeriod()), bgarageActual = bgarageRows.reduce(function(sum, row) { return sum + numberValue(row.dailyActual); }, 0), bgarageTarget = bgarageRows.reduce(function(sum, row) { return sum + numberValue(row.dailyTarget); }, 0);
    var indonesiaRows = indonesiaRowsInRange(), indonesiaLatestDate = indonesiaRows.length ? indonesiaRows[indonesiaRows.length - 1].date : '', indonesiaLatestRows = indonesiaLatestDate ? indonesiaRows.filter(function(row) { return row.date === indonesiaLatestDate; }) : [];
    var indonesiaLatestSales = indonesiaLatestRows.reduce(function(sum, row) { return sum + indonesiaSales(row); }, 0), reportDate = latest ? latest.date : (state.to || lastDate());
    var movementTone = latestDelta === null ? 'neutral' : latestDelta >= 0 ? 'positive' : 'negative', movementText = latestDelta === null ? 'No prior-day comparison' : (latestDelta >= 0 ? '+' : '') + formatNumber(latestDelta) + ' units vs prior day';
    var verdict = !latest ? 'No daily sales data matches the selected report window.' : latestDelta === null ? 'Latest sales were ' + formatNumber(latestTotal) + ' units.' : 'Sales ' + (latestDelta >= 0 ? 'increased' : 'decreased') + ' by ' + formatNumber(Math.abs(latestDelta)) + ' units versus the prior day.';
    var salesBody = salesRows.map(function(row, index) {
      var prior = salesRows[index - 1], currentValue = salesTotalForChannel(row, specialChannel), priorValue = prior ? salesTotalForChannel(prior, specialChannel) : 0, movement = !prior ? 'First day' : currentValue >= priorValue ? 'Increase' : 'Decrease';
      if (specialChannel === 'all') return '<tr><td><strong>' + escapeHtml(formatDate(row.date, true)) + '</strong></td><td>' + formatNumber(row.hq) + '</td><td>' + formatNumber(row.bp) + '</td><td><strong>' + formatNumber(row.total) + '</strong></td><td><span class="movement-badge ' + (movement === 'Increase' ? 'increase' : movement === 'Decrease' ? 'decrease' : '') + '">' + movement + '</span></td></tr>';
      return '<tr><td><strong>' + escapeHtml(formatDate(row.date, true)) + '</strong></td><td><strong>' + formatNumber(salesTotalForChannel(row, specialChannel)) + '</strong></td><td><span class="movement-badge ' + (movement === 'Increase' ? 'increase' : movement === 'Decrease' ? 'decrease' : '') + '">' + movement + '</span></td></tr>';
    }).join('');
    var serviceBody = salesRows.map(function(row) {
      var rsa = row.rsaJumpstart + row.rsaTyrePatch + row.rsaFuel, resq = row.resQSelangor + row.resQJb + row.resQPahang + row.resQPenang;
      return '<tr><td><strong>' + escapeHtml(formatDate(row.date, true)) + '</strong></td><td>' + formatNumber(row.rsaJumpstart) + '</td><td>' + formatNumber(row.rsaTyrePatch) + '</td><td>' + formatNumber(row.rsaFuel) + '</td><td><strong>' + formatNumber(rsa) + '</strong></td><td>' + formatNumber(row.b2w) + '</td><td><strong>' + formatNumber(resq) + '</strong></td><td><strong>' + formatNumber(totalWarranty(row)) + '</strong></td></tr>';
    }).join('');
    var rsaB2wBody = salesRows.map(function(row) {
      var rsa = row.rsaJumpstart + row.rsaTyrePatch + row.rsaFuel;
      return '<tr><td><strong>' + escapeHtml(formatDate(row.date, true)) + '</strong></td><td>' + formatNumber(row.rsaJumpstart) + '</td><td>' + formatNumber(row.rsaTyrePatch) + '</td><td>' + formatNumber(row.rsaFuel) + '</td><td><strong>' + formatNumber(rsa) + '</strong></td><td><strong>' + formatNumber(row.b2w) + '</strong></td></tr>';
    }).join('');
    var resqBody = salesRows.map(function(row) {
      var total = row.resQSelangor + row.resQJb + row.resQPahang + row.resQPenang;
      return '<tr><td><strong>' + escapeHtml(formatDate(row.date, true)) + '</strong></td><td>' + formatNumber(row.resQSelangor) + '</td><td>' + formatNumber(row.resQJb) + '</td><td>' + formatNumber(row.resQPahang) + '</td><td>' + formatNumber(row.resQPenang) + '</td><td><strong>' + formatNumber(total) + '</strong></td></tr>';
    }).join('');
    var warrantyBody = salesRows.map(function(row) {
      return '<tr><td><strong>' + escapeHtml(formatDate(row.date, true)) + '</strong></td><td><strong>' + formatNumber(row.warranty1st) + '</strong></td><td>' + formatNumber(row.warranty2nd) + '</td><td>' + formatNumber(row.warranty3rd) + '</td></tr>';
    }).join('');
    var latestService = latest || {}, latestResq = latest ? latest.resQSelangor + latest.resQJb + latest.resQPahang + latest.resQPenang : 0, latestWarranty = latest ? totalWarranty(latest) : 0;
    var bgarageBody = bgarageRows.map(function(row) {
      var status = performanceStatus(row.dailyAchievement, row.dailyTarget, state.data.thresholds);
      return '<tr><td><strong>' + escapeHtml(row.outlet) + '</strong></td><td>' + formatBGarageMoney(row.dailyTarget) + '</td><td>' + formatBGarageMoney(row.dailyActual) + '</td><td><strong>' + formatAchievement(row.dailyAchievement) + '</strong></td><td><span class="performance-badge ' + status + '">' + performanceLabel(status) + '</span></td><td>' + formatBGarageMoney(row.mtdActual) + '</td><td>' + formatBGarageMoney(row.monthlyTarget) + '</td><td><strong>' + formatNumber(row.conversions) + '</strong></td><td>' + (row.intakeActual === null ? 'N/A' : formatNumber(row.intakeActual)) + ' / ' + (row.intakeTarget === null ? 'N/A' : formatNumber(row.intakeTarget)) + '</td></tr>';
    }).join('');
    var sumBGarage = function(key) { return bgarageRows.reduce(function(sum, row) { return sum + numberValue(row[key]); }, 0); };
    var bgarageTotals = {
      dailyTarget: sumBGarage('dailyTarget'), dailyActual: sumBGarage('dailyActual'), mtdActual: sumBGarage('mtdActual'), monthlyTarget: sumBGarage('monthlyTarget'),
      referrals: sumBGarage('referrals'), conversions: sumBGarage('conversions'), pickDrop: sumBGarage('pickDrop'), intakeActual: sumBGarage('intakeActual'), intakeTarget: sumBGarage('intakeTarget')
    };
    bgarageTotals.dailyAchievement = bgarageTotals.dailyTarget ? Math.round(bgarageTotals.dailyActual / bgarageTotals.dailyTarget * 100) : null;
    bgarageTotals.mtdAchievement = bgarageTotals.monthlyTarget ? Math.round(bgarageTotals.mtdActual / bgarageTotals.monthlyTarget * 100) : null;
    bgarageTotals.shortfall = bgarageTotals.mtdActual - bgarageTotals.monthlyTarget;
    bgarageTotals.conversionRate = bgarageTotals.referrals ? Math.round(bgarageTotals.conversions / bgarageTotals.referrals * 100) : 0;
    bgarageTotals.intakeAchievement = bgarageTotals.intakeTarget ? Math.round(bgarageTotals.intakeActual / bgarageTotals.intakeTarget * 100) : 0;
    var bgarageSalesBody = bgarageRows.map(function(row) {
      var status = performanceStatus(row.dailyAchievement, row.dailyTarget, state.data.thresholds);
      return '<tr><td><strong>' + escapeHtml(row.outlet) + '</strong></td><td>' + formatBGarageMoney(row.dailyTarget) + '</td><td>' + formatBGarageMoney(row.dailyActual) + '</td><td><strong>' + formatAchievement(row.dailyAchievement) + '</strong></td><td><span class="performance-badge ' + status + '">' + performanceLabel(status) + '</span></td><td>' + formatAchievement(row.mtdAchievement) + '</td><td>' + formatBGarageMoney(row.mtdActual) + '</td><td>' + formatBGarageMoney(row.monthlyTarget) + '</td><td class="' + (numberValue(row.shortfall) < 0 ? 'bad' : 'good') + '">' + formatBGarageMoney(row.shortfall) + '</td></tr>';
    }).join('');
    var bgarageTotalStatus = performanceStatus(bgarageTotals.dailyAchievement, bgarageTotals.dailyTarget, state.data.thresholds);
    var bgarageSalesTotal = '<tr class="total-row"><th>Total BGarage</th><th>' + formatMoney(bgarageTotals.dailyTarget) + '</th><th>' + formatMoney(bgarageTotals.dailyActual) + '</th><th>' + formatAchievement(bgarageTotals.dailyAchievement) + '</th><th><span class="performance-badge ' + bgarageTotalStatus + '">' + performanceLabel(bgarageTotalStatus) + '</span></th><th>' + formatAchievement(bgarageTotals.mtdAchievement) + '</th><th>' + formatMoney(bgarageTotals.mtdActual) + '</th><th>' + formatMoney(bgarageTotals.monthlyTarget) + '</th><th class="' + (bgarageTotals.shortfall < 0 ? 'bad' : 'good') + '">' + formatMoney(bgarageTotals.shortfall) + '</th></tr>';
    var bgarageIntakeBody = bgarageRows.map(function(row) {
      var conversionRate = row.referrals ? Math.round(row.conversions / row.referrals * 100) : 0, status = performanceStatus(row.intakeAchievement, row.intakeTarget, state.data.thresholds);
      return '<tr><td><strong>' + escapeHtml(row.outlet) + '</strong></td><td>' + formatNumber(row.referrals) + '</td><td>' + formatNumber(row.conversions) + '</td><td><strong>' + conversionRate + '%</strong></td><td>' + formatNumber(row.pickDrop) + '</td><td>' + (row.intakeActual === null ? 'N/A' : formatNumber(row.intakeActual)) + '</td><td>' + (row.intakeTarget === null ? 'N/A' : formatNumber(row.intakeTarget)) + '</td><td><strong>' + formatAchievement(row.intakeAchievement) + '</strong></td><td><span class="performance-badge ' + status + '">' + performanceLabel(status) + '</span></td></tr>';
    }).join('');
    var bgarageIntakeStatus = performanceStatus(bgarageTotals.intakeAchievement, bgarageTotals.intakeTarget, state.data.thresholds);
    var bgarageIntakeTotal = '<tr class="total-row"><th>Total BGarage</th><th>' + formatNumber(bgarageTotals.referrals) + '</th><th>' + formatNumber(bgarageTotals.conversions) + '</th><th>' + bgarageTotals.conversionRate + '%</th><th>' + formatNumber(bgarageTotals.pickDrop) + '</th><th>' + formatNumber(bgarageTotals.intakeActual) + '</th><th>' + formatNumber(bgarageTotals.intakeTarget) + '</th><th>' + bgarageTotals.intakeAchievement + '%</th><th><span class="performance-badge ' + bgarageIntakeStatus + '">' + performanceLabel(bgarageIntakeStatus) + '</span></th></tr>';
    var indonesiaMonthKey = indonesiaLatestDate ? indonesiaLatestDate.slice(0, 7) : '', indonesiaMonthRows = (state.data.indonesia || []).filter(function(row) { return indonesiaMonthKey && row.date.slice(0, 7) === indonesiaMonthKey && row.date <= indonesiaLatestDate; }), indonesiaGroups = indonesiaGroupedRows(indonesiaMonthRows);
    var indonesiaLatestBody = indonesiaLatestRows.map(function(row) { return indonesiaTableRow(row, true); }).join(''), indonesiaMonthBody = indonesiaGroups.map(function(row) { return indonesiaTableRow(row, false); }).join('');
    var specialFilter = '<div class="daily-detail-actions special-channel-actions"><div class="daily-detail-filter" role="group" aria-label="Summary channel filter"><span>Show</span><button type="button" class="daily-detail-button all ' + (specialChannel === 'all' ? 'is-active' : '') + '" data-special-channel="all">All</button><button type="button" class="daily-detail-button hq ' + (specialChannel === 'hq' ? 'is-active' : '') + '" data-special-channel="hq">HQ</button><button type="button" class="daily-detail-button bp ' + (specialChannel === 'bp' ? 'is-active' : '') + '" data-special-channel="bp">BP</button></div><span class="result-count">' + salesRows.length + ' day' + (salesRows.length === 1 ? '' : 's') + '</span></div>';
    var networkPanels = (specialChannel === 'all' || specialChannel === 'hq' ? specialNetworkPanel('HQ', hqPitstops) : '') + (specialChannel === 'all' || specialChannel === 'bp' ? specialNetworkPanel('BP', bpPitstops) : '') + (specialChannel === 'all' || specialChannel === 'hq' ? specialTierPanel('HQ', hqPitstops) : '') + (specialChannel === 'all' || specialChannel === 'bp' ? specialTierPanel('BP', bpPitstops) : '');
    var pitstopDetails = (specialChannel === 'all' || specialChannel === 'hq' ? specialPitstopDetails(hqPitstops, 'HQ') : '') + (specialChannel === 'all' || specialChannel === 'bp' ? specialPitstopDetails(bpPitstops, 'BP') : '');
    var salesHeaders = specialChannel === 'all' ? '<th>Date</th><th>HQ units</th><th>BP units</th><th>Total units</th><th>Movement</th>' : '<th>Date</th><th>' + escapeHtml(specialChannelLabel) + ' units</th><th>Movement</th>', salesColspan = specialChannel === 'all' ? 5 : 3;
    return '<section class="special-report">' +
      '<article class="special-hero panel"><div><span class="eyebrow">CEO daily brief</span><h2>Summary</h2><p>' + escapeHtml(formatRange(state.from, state.to)) + ' | consolidated sales and operational performance</p></div><div class="special-hero-actions">' + specialFilter + '</div></article>' +
      '<article class="special-verdict ' + movementTone + '"><div><span>Executive readout</span><strong>' + escapeHtml(verdict) + '</strong></div><small>Latest report date: ' + escapeHtml(formatDate(reportDate, true)) + '</small></article>' +
      '<section class="special-kpi-grid">' + kpi('S', 'teal', 'Latest sales', formatNumber(latestTotal), movementText) + kpi('A', 'blue', '3-day moving average', formatNumber(movingAverage), movingWindow.length + ' available day' + (movingWindow.length === 1 ? '' : 's')) + kpi('P', 'amber', 'Pitstops on track', formatNumber(networkSummary.green), percentage(networkSummary.green, networkSummary.total) + '% of ' + formatNumber(networkSummary.total) + ' locations') + kpi('V', 'blue', 'Service activity', formatNumber(serviceTotal), 'RSA, B2W, ResQ and warranty') + kpi('B', 'red', 'BGarage achievement', percentage(bgarageActual, bgarageTarget) + '%', formatMoney(bgarageActual) + ' of ' + formatMoney(bgarageTarget)) + kpi('I', 'green', 'Indonesia latest sales', formatNumber(indonesiaLatestSales), indonesiaLatestDate ? escapeHtml(formatDate(indonesiaLatestDate, true)) : 'Awaiting upload') + '</section>' +
      '<article class="panel special-section"><div class="panel-header"><div><span class="eyebrow">Sales performance</span><h2>' + escapeHtml(specialChannelLabel) + ' daily sales</h2><p>Period sales ' + formatNumber(periodSales) + ' units | moving average ' + formatNumber(movingAverage) + ' units.</p></div><span class="result-count">' + salesRows.length + ' day' + (salesRows.length === 1 ? '' : 's') + '</span></div><div class="table-scroll"><table class="data-table special-sales-table"><thead><tr>' + salesHeaders + '</tr></thead><tbody>' + (salesBody || '<tr><td colspan="' + salesColspan + '"><div class="empty-state">No daily sales rows match this period.</div></td></tr>') + '</tbody></table></div></article>' +
      '<section class="special-two-column special-network-grid ' + (specialChannel === 'all' ? '' : 'is-single') + '">' + networkPanels + '</section>' +
      '<section class="special-service-kpis">' + kpi('R', 'teal', 'Latest RSA', formatNumber(latest ? latest.rsaJumpstart + latest.rsaTyrePatch + latest.rsaFuel : 0), 'Jumpstart ' + formatNumber(latestService.rsaJumpstart) + ' | Tyre ' + formatNumber(latestService.rsaTyrePatch) + ' | Fuel ' + formatNumber(latestService.rsaFuel)) + kpi('B', 'blue', 'Latest B2W', formatNumber(latestService.b2w), 'Pieces') + kpi('Q', 'amber', 'Latest ResQ', formatNumber(latestResq), 'All states') + kpi('W', 'red', 'Latest warranty', formatNumber(latestWarranty), '1st, 2nd and 3rd attendance') + '</section>' +
      '<article class="panel special-section"><div class="panel-header"><div><span class="eyebrow">Services and warranty</span><h2>Daily operational breakdown</h2><p>RSA, B2W, ResQ and warranty cases in the selected report window.</p></div></div><div class="table-scroll"><table class="data-table special-service-table"><thead><tr><th>Date</th><th>RSA jumpstart</th><th>RSA tyre</th><th>RSA fuel</th><th>Total RSA</th><th>B2W</th><th>Total ResQ</th><th>Warranty</th></tr></thead><tbody>' + (serviceBody || '<tr><td colspan="8"><div class="empty-state">No service data is available.</div></td></tr>') + '</tbody></table></div></article>' +
      '<section class="special-email-table-grid"><article class="panel special-section"><div class="panel-header"><div><span class="eyebrow">RSA and B2W</span><h2>Daily sales breakdown</h2><p>Jumpstart, tyre patch, fuel, total RSA, and B2W volume.</p></div><span class="result-count">' + salesRows.length + ' days</span></div><div class="table-scroll"><table class="data-table special-email-table special-rsa-table"><thead><tr><th>Date</th><th>RSA jumpstart</th><th>RSA tyre patch</th><th>RSA fuel</th><th>Total RSA</th><th>B2W</th></tr></thead><tbody>' + (rsaB2wBody || '<tr><td colspan="6"><div class="empty-state">No RSA or B2W data is available.</div></td></tr>') + '</tbody></table></div></article>' +
      '<article class="panel special-section"><div class="panel-header"><div><span class="eyebrow">ResQ network</span><h2>ResQ by state</h2><p>Daily cases across Selangor, Johor Bahru, Pahang, and Pulau Pinang.</p></div><span class="result-count">' + salesRows.length + ' days</span></div><div class="table-scroll"><table class="data-table special-email-table special-resq-table"><thead><tr><th>Date</th><th>HQ Selangor</th><th>Johor Bahru</th><th>Pahang</th><th>Pulau Pinang</th><th>Total ResQ</th></tr></thead><tbody>' + (resqBody || '<tr><td colspan="6"><div class="empty-state">No ResQ data is available.</div></td></tr>') + '</tbody></table></div></article>' +
      '<article class="panel special-section special-email-table-wide"><div class="panel-header"><div><span class="eyebrow">Warranty tracking</span><h2>Warranty attendance</h2><p>First, second, and third attendance cases for every reporting date.</p></div><span class="result-count">' + salesRows.length + ' days</span></div><div class="table-scroll"><table class="data-table special-email-table special-warranty-table"><thead><tr><th>Date</th><th>Total cases attended</th><th>Cases attended twice</th><th>Cases attended three times</th></tr></thead><tbody>' + (warrantyBody || '<tr><td colspan="4"><div class="empty-state">No warranty data is available.</div></td></tr>') + '</tbody></table></div></article></section>' +
      '<article class="panel special-section"><div class="panel-header"><div><span class="eyebrow">BGarage network</span><h2>Sales and lead-handling summary</h2><p>Period figures are aggregated; MTD sales use the latest cumulative snapshot.</p></div><span class="result-count">' + bgarageRows.length + ' outlets</span></div><div class="table-scroll"><table class="data-table special-bgarage-table"><thead><tr><th>Outlet</th><th>Period target</th><th>Period actual</th><th>Achievement</th><th>Status</th><th>MTD actual</th><th>Monthly target</th><th>Conversions</th><th>Intake</th></tr></thead><tbody>' + (bgarageBody || '<tr><td colspan="9"><div class="empty-state">No BGarage data is available.</div></td></tr>') + '</tbody></table></div></article>' +
      '<article class="panel special-section special-bgarage-classification"><div class="panel-header"><div><span class="eyebrow">BGarage classification</span><h2>Achievement status rules</h2><p>Status is calculated automatically from achievement against target.</p></div></div><table class="data-table special-email-table special-classification-table"><thead><tr><th>Achievement</th><th>Status</th></tr></thead><tbody><tr><td>&ge;100%</td><td class="performance-cell achieved"><span class="performance-badge achieved">Achieved</span></td></tr><tr><td>80%&ndash;99%</td><td class="performance-cell near"><span class="performance-badge near">Near target</span></td></tr><tr><td>60%&ndash;79%</td><td class="performance-cell below"><span class="performance-badge below">Below target</span></td></tr><tr><td>&lt;60%</td><td class="performance-cell critical"><span class="performance-badge critical">Critical</span></td></tr><tr><td>No target</td><td class="performance-cell na"><span class="performance-badge na">N/A</span></td></tr></tbody></table></article>' +
      '<article class="panel special-section"><div class="panel-header"><div><span class="eyebrow">BGarage sales performance</span><h2>Sales performance by outlet</h2><p>Selected-period target and actual sales with the latest cumulative MTD snapshot.</p></div><span class="result-count">' + bgarageRows.length + ' outlets</span></div><div class="table-scroll"><table class="data-table special-email-table special-bgarage-sales-table"><thead><tr><th>BGarage outlet</th><th>Period target</th><th>Period actual</th><th>Period achievement</th><th>Sales status</th><th>MTD achievement</th><th>MTD actual</th><th>Monthly target</th><th>MTD shortfall</th></tr></thead><tbody>' + (bgarageSalesBody ? bgarageSalesBody + bgarageSalesTotal : '<tr><td colspan="9"><div class="empty-state">No BGarage sales data is available.</div></td></tr>') + '</tbody></table></div></article>' +
      '<article class="panel special-section"><div class="panel-header"><div><span class="eyebrow">Conversion and intake</span><h2>Lead handling performance</h2><p>Referral conversion, pick and drop cases, and intake achievement by outlet.</p></div><span class="result-count">' + bgarageRows.length + ' outlets</span></div><div class="table-scroll"><table class="data-table special-email-table special-bgarage-intake-table"><thead><tr><th>BGarage outlet</th><th>Cases referred</th><th>Conversions</th><th>Conversion rate</th><th>Pick and drop</th><th>Intake actual</th><th>Intake target</th><th>Intake achievement</th><th>Intake status</th></tr></thead><tbody>' + (bgarageIntakeBody ? bgarageIntakeBody + bgarageIntakeTotal : '<tr><td colspan="9"><div class="empty-state">No BGarage lead-handling data is available.</div></td></tr>') + '</tbody></table></div></article>' +
      '<article class="panel special-section"><div class="panel-header"><div><span class="eyebrow">Bateriku Indonesia</span><h2>Daily and month-to-date performance</h2><p>Latest daily input followed by the cumulative monthly summary.</p></div><span class="result-count">' + indonesiaLatestRows.length + ' latest rows</span></div><h3 class="special-subheading">Latest day | ' + escapeHtml(indonesiaLatestDate ? formatDate(indonesiaLatestDate, true) : 'No date loaded') + '</h3><div class="table-scroll"><table class="data-table indonesia-table">' + indonesiaTableHeader(true) + '<tbody>' + (indonesiaLatestBody || '<tr><td colspan="12"><div class="empty-state">No Indonesia daily data is available.</div></td></tr>') + '</tbody></table></div><h3 class="special-subheading">Month-to-date</h3><div class="table-scroll"><table class="data-table indonesia-table">' + indonesiaTableHeader(false) + '<tbody>' + (indonesiaMonthBody || '<tr><td colspan="11"><div class="empty-state">No Indonesia month-to-date data is available.</div></td></tr>') + '</tbody></table></div></article>' +
      pitstopDetails + '</section>';
  }

  function emailOrdinalDate(iso) {
    var match = String(iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return formatDate(iso, true);
    var day = Number(match[3]), suffix = day % 10 === 1 && day % 100 !== 11 ? 'st' : day % 10 === 2 && day % 100 !== 12 ? 'nd' : day % 10 === 3 && day % 100 !== 13 ? 'rd' : 'th';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return day + suffix + ' ' + months[Number(match[2]) - 1] + ' ' + match[1];
  }

  function emailStatusDot(status) {
    return '<span class="email-status-dot ' + statusClass(status) + '" role="img" aria-label="' + (status === 'green' ? 'Green' : status === 'yellow' ? 'Yellow' : 'Red') + '"></span>';
  }

  function emailDetailColumnGroup() {
    return '<colgroup><col width="32"><col width="322"><col width="99"><col width="129"><col width="60"><col width="50"><col width="112"><col width="105"></colgroup>';
  }

  function emailSummaryStateLabel(value) {
    var stateName = canonicalState(value);
    if (stateName === 'N. Sembilan') return 'N.SEMBILAN';
    if (stateName === 'Penang') return 'PENANG';
    return String(stateName || value || 'Unassigned').toUpperCase();
  }

  // Build every email pitstop table from one canonical set of detail rows.
  // B2C includes both HQ and warehouse branches, matching the state-detail
  // section used in the daily email. Closed branches remain excluded.
  function b2cStateSummaryWindow() {
    var allowed = ['all', 'previous', 'fri-sun', '7d', '14d', 'month'], preset = allowed.indexOf(state.b2cStateSummaryPreset) !== -1 ? state.b2cStateSummaryPreset : 'previous';
    var loadedPitstopDates = (state.data && state.data.pitstops || []).map(function(row) { return row && row.date; }).filter(function(date) { return /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')); }).sort();
    var reportTo = state.to || liveReportEndDate() || lastDate(), first = availableFirstDate() || reportTo;
    var from = state.from || first, to = state.to || reportTo;
    if (!reportTo) return { preset: preset, from: '', to: '' };
    if (preset === 'all') from = first;
    // The dashboard report end is already yesterday. Reuse that date instead
    // of subtracting a second day for this independent summary shortcut.
    else if (preset === 'previous') { from = reportTo; to = reportTo; }
    else if (preset === 'fri-sun') {
      // Find the latest completed Sunday, then include its Friday and Saturday.
      // On Monday reporting this is the immediately preceding Fri-Sun weekend.
      var weekday = new Date(reportTo + 'T00:00:00Z').getUTCDay();
      to = shiftIsoDate(reportTo, -weekday);
      from = shiftIsoDate(to, -2);
    }
    else if (preset === 'month') from = reportTo.slice(0, 8) + '01';
    else if (preset === '14d') from = shiftIsoDate(reportTo, -13);
    else if (preset === '7d') from = shiftIsoDate(reportTo, -6);

    if (first && from < first) from = first;

    return { preset: preset, from: from || '', to: to || reportTo };
  }

  function summaryNetworkRangeKey(summaryWindow) {
    return summaryWindow && summaryWindow.from && summaryWindow.to ? summaryWindow.from + '::' + summaryWindow.to : '';
  }

  function summaryNetworkSalesMapForWindow(summaryWindow) {
    var rangeKey = summaryNetworkRangeKey(summaryWindow);
    if (!rangeKey) return null;
    if (state.summaryNetworkSyncKey === rangeKey && state.summaryNetworkSalesByKey) return state.summaryNetworkSalesByKey;
    if (state.pitstopSyncRange === rangeKey && state.grafanaPitstopSalesByKey) return state.grafanaPitstopSalesByKey;
    return null;
  }

  function summaryNetworkDataReady(summaryWindow) {
    return !HOSTED_MODE || !summaryWindow || summaryWindow.preset === 'report' || !!summaryNetworkSalesMapForWindow(summaryWindow);
  }

  async function syncSummaryNetworkSales() {
    if (!HOSTED_MODE || state.view !== 'special') return;
    var summaryWindow = b2cStateSummaryWindow(), rangeKey = summaryNetworkRangeKey(summaryWindow);
    if (summaryWindow.preset === 'report' || !rangeKey) return;
    var reusableMap = summaryNetworkSalesMapForWindow(summaryWindow);
    if (reusableMap) {
      state.summaryNetworkSalesByKey = reusableMap;
      state.summaryNetworkSyncKey = rangeKey;
      state.summaryNetworkLoading = false;
      state.summaryNetworkError = '';
      render();
      return;
    }
    if (summaryNetworkSalesRequest && summaryNetworkSalesRequest.key === rangeKey) return;
    if (summaryNetworkSalesRequest) summaryNetworkSalesRequest.controller.abort();
    var controller = new AbortController(), request = { key: rangeKey, controller: controller };
    summaryNetworkSalesRequest = request;
    state.summaryNetworkLoading = true;
    state.summaryNetworkError = '';
    render();
    try {
      var cached = pitstopResponseCache[rangeKey], payload;
      if (cached && Date.now() - cached.savedAt < PITSTOP_BROWSER_CACHE_MS) payload = cached.payload;
      else {
        payload = await fetchPitstopPerformance(summaryWindow.from, summaryWindow.to, controller.signal);
        pitstopResponseCache[rangeKey] = { savedAt: Date.now(), payload: payload };
      }
      if (!payload || !Array.isArray(payload.pitstops)) throw new Error('Grafana returned an invalid pitstop response.');
      var salesMap = grafanaPitstopSalesMap(payload);

      var currentWindow = b2cStateSummaryWindow();
      if (summaryNetworkSalesRequest !== request || currentWindow.preset === 'report' || summaryNetworkRangeKey(currentWindow) !== rangeKey) return;
      state.summaryNetworkSalesByKey = salesMap;
      state.summaryNetworkSyncKey = rangeKey;
      state.summaryNetworkError = '';
    } catch (error) {
      if (!error || error.name !== 'AbortError') state.summaryNetworkError = error && error.message || 'Grafana pitstop sales could not be loaded.';
    } finally {
      if (summaryNetworkSalesRequest === request) summaryNetworkSalesRequest = null;
      if (!summaryNetworkSalesRequest) state.summaryNetworkLoading = false;
      if (state.view === 'special') render();
    }
  }

  function scheduleSummaryNetworkSalesSync(delay) {
    if (!HOSTED_MODE || state.view !== 'special') return;
    window.clearTimeout(scheduleSummaryNetworkSalesSync.timer);
    scheduleSummaryNetworkSalesSync.timer = window.setTimeout(syncSummaryNetworkSales, delay || 0);
  }

  function weeklyRankingWindow() {
    if (state.weeklyRankingPreset !== 'previous-week') return b2cStateSummaryWindow();
    var reportTo = state.to || liveReportEndDate() || lastDate(), first = availableFirstDate() || reportTo;
    if (!reportTo) return { preset: 'previous-week', from: '', to: '' };
    // The previous completed week ends on the latest Sunday at or before the
    // report date. Monday reporting therefore selects the Fri-Sun just ended.
    var weekday = new Date(reportTo + 'T00:00:00Z').getUTCDay();
    var to = shiftIsoDate(reportTo, -weekday), from = shiftIsoDate(to, -6);
    if (first && from < first) from = first;
    return { preset: 'previous-week', from: from, to: to };
  }

  function weeklyRankingRangeKey(window) {
    return window && window.from && window.to ? window.from + '::' + window.to : '';
  }

  function weeklyRankingSalesMapForWindow(window) {
    var rangeKey = weeklyRankingRangeKey(window);
    return rangeKey && state.weeklyRankingSyncKey === rangeKey && state.weeklyRankingSalesByKey ? state.weeklyRankingSalesByKey : null;
  }

  function weeklyRankingDataReady(window) {
    return state.weeklyRankingPreset !== 'previous-week' || !HOSTED_MODE || !!weeklyRankingSalesMapForWindow(window);
  }

  function resetWeeklyRankingSales() {
    if (weeklyRankingSalesRequest) weeklyRankingSalesRequest.controller.abort();
    weeklyRankingSalesRequest = null;
    state.weeklyRankingSalesByKey = null;
    state.weeklyRankingSyncKey = '';
    state.weeklyRankingLoading = false;
    state.weeklyRankingError = '';
  }

  async function syncWeeklyRankingSales() {
    if (!HOSTED_MODE || state.view !== 'special' || state.weeklyRankingPreset !== 'previous-week') return;
    var weeklyWindow = weeklyRankingWindow(), rangeKey = weeklyRankingRangeKey(weeklyWindow);
    if (!rangeKey || weeklyRankingDataReady(weeklyWindow)) return;
    if (weeklyRankingSalesRequest) weeklyRankingSalesRequest.controller.abort();
    var controller = new AbortController(), request = { controller: controller, rangeKey: rangeKey };
    weeklyRankingSalesRequest = request;
    state.weeklyRankingLoading = true;
    state.weeklyRankingError = '';
    render();
    try {
      var cached = pitstopResponseCache[rangeKey], payload = cached && Date.now() - cached.savedAt < PITSTOP_BROWSER_CACHE_MS
        ? cached.payload
        : await fetchPitstopPerformance(weeklyWindow.from, weeklyWindow.to, controller.signal);
      if (!cached) pitstopResponseCache[rangeKey] = { savedAt: Date.now(), payload: payload };
      if (!payload || !Array.isArray(payload.pitstops)) throw new Error('Grafana returned an invalid pitstop response.');
      if (weeklyRankingSalesRequest !== request || weeklyRankingRangeKey(weeklyRankingWindow()) !== rangeKey) return;
      state.weeklyRankingSalesByKey = grafanaPitstopSalesMap(payload);
      state.weeklyRankingSyncKey = rangeKey;
    } catch (error) {
      if (!error || error.name !== 'AbortError') state.weeklyRankingError = error && error.message || 'Grafana weekly ranking sales could not be loaded.';
    } finally {
      if (weeklyRankingSalesRequest === request) {
        weeklyRankingSalesRequest = null;
        state.weeklyRankingLoading = false;
        render();
      }
    }
  }

  function scheduleWeeklyRankingSalesSync(delay) {
    if (!HOSTED_MODE || state.view !== 'special' || state.weeklyRankingPreset !== 'previous-week') return;
    window.clearTimeout(scheduleWeeklyRankingSalesSync.timer);
    scheduleWeeklyRankingSalesSync.timer = window.setTimeout(syncWeeklyRankingSales, delay || 0);
  }

  function weeklyRankingFilterMarkup() {
    var weeklyWindow = weeklyRankingWindow(), active = state.weeklyRankingPreset === 'previous-week';
    var label = active ? 'Previous week' : 'Current ranking period';
    var dateLabel = weeklyWindow.from && weeklyWindow.to ? ' | ' + formatSummaryDate(weeklyWindow.from) + ' - ' + formatSummaryDate(weeklyWindow.to) : '';
    var syncLabel = active && HOSTED_MODE ? state.weeklyRankingLoading ? ' | Loading Grafana...' : state.weeklyRankingError ? ' | Grafana unavailable' : weeklyRankingDataReady(weeklyWindow) ? ' | Grafana synced' : ' | Waiting for Grafana' : '';
    return '<div class="email-weekly-ranking-filter" data-copy-exclude><span class="email-weekly-ranking-status' + (state.weeklyRankingError ? ' has-error' : '') + '" role="status" title="' + escapeHtml(state.weeklyRankingError || '') + '">' + escapeHtml(label + dateLabel + syncLabel) + '</span><button type="button" class="email-local-filter-button' + (active ? ' is-active' : '') + '" data-weekly-ranking-previous aria-pressed="' + active + '">Previous week</button></div>';
  }

  function b2cStateSummaryFilterMarkup() {
    var summaryWindow = b2cStateSummaryWindow(), labels = { all: 'All dates', previous: 'Previous Day', 'fri-sun': 'Previous Fri-Sun', '7d': '7 days', '14d': '14 days', month: 'Whole month' };
    var status = summaryWindow.preset === 'report' ? 'Report window' : labels[summaryWindow.preset];
    var dateLabel = summaryWindow.from && summaryWindow.to ? ' | ' + formatSummaryDate(summaryWindow.from) + ' - ' + formatSummaryDate(summaryWindow.to) : '';
    var syncLabel = '', syncClass = '';
    if (HOSTED_MODE && summaryWindow.preset !== 'report') {
      if (state.summaryNetworkLoading) { syncLabel = ' | Loading Grafana...'; syncClass = ' is-loading'; }
      else if (state.summaryNetworkError) { syncLabel = ' | Grafana unavailable'; syncClass = ' has-error'; }
      else if (summaryNetworkDataReady(summaryWindow)) syncLabel = ' | Grafana synced';
      else syncLabel = ' | Waiting for Grafana';
    }
    var buttons = Object.keys(labels).map(function(preset) {
      var active = summaryWindow.preset === preset;
      return '<button type="button" class="email-local-filter-button' + (active ? ' is-active' : '') + '" data-b2c-state-summary-range="' + preset + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + labels[preset] + '</button>';
    }).join('');
    return '<div class="email-local-summary-filter" data-copy-exclude><span class="email-local-summary-filter-status' + syncClass + '" role="status" title="' + escapeHtml(state.summaryNetworkError || '') + '">' + escapeHtml(status + dateLabel + syncLabel) + '</span><span class="email-local-summary-filter-buttons" role="group" aria-label="B2C and B2B2C performance table date filter">' + buttons + '</span></div>';
  }

  function emailSummaryPitstopName(name) {
    var value = String(name || '').trim();
    return canonicalPitstopKey(value) === 'HQKLANG' ? 'HQ KAPAR' : value;
  }

  function emailPitstopNetworks(reportDate, options) {
    var rows = emailLatestPitstopSnapshot(reportDate, options).map(function(row) {
      return Object.assign({}, row, {
        name: emailSummaryPitstopName(row.name),
        channel: canonicalChannel(row.channel),
        tier: String(row.tier || 'Unassigned').trim() || 'Unassigned',
        region: String(row.region || 'Unassigned').trim() || 'Unassigned',
        state: String(row.state || 'Unassigned').trim() || 'Unassigned'
      });
    }).filter(function(row) { return row.channel !== 'HQC' && row.channel !== 'BPC'; });
    return {
      b2c: rows.filter(function(row) { return row.channel === 'HQ' || row.channel === 'WH'; }),
      bp: rows.filter(function(row) { return row.channel === 'BP'; })
    };
  }

  function emailVisibleB2cRows(rows) {
    if (!state.emailWarehouseHidden) return rows || [];
    // These operational WH locations remain part of the daily management view.
    // All other WH and WAREHOUSE rows are hidden until the user selects Show WH.
    var visibleWarehouseExceptions = {
      'WH INDERA MAHKOTA': true,
      'WH GONG BADAK': true,
      'WH PENGKALAN CHEPA': true,
      'WH SUNGAI PETANI': true,
      'WH BUTTERWORTH': true,
      'WH IPOH': true,
      'WH KAJANG SG CHUA': true,
      'WH INDAHPURA KULAI': true,
      'WH YONG PENG': true
    };
    return (rows || []).filter(function(row) {
      var name = String(row && row.name || '').trim();
      if (visibleWarehouseExceptions[name.toUpperCase()]) return true;
      return canonicalChannel(row && row.channel) !== 'WH' && !/^WH(?:\s|$)/i.test(name) && !/\bWAREHOUSE\b/i.test(name);
    });
  }

  function emailWarehouseToggleButton() {
    var hidden = !!state.emailWarehouseHidden;
    return '<button type="button" class="header-button email-ranking-toggle email-warehouse-toggle ' + (hidden ? 'is-active' : '') + '" data-email-warehouse-toggle aria-pressed="' + hidden + '">' + (hidden ? 'Show WH' : 'Hide WH') + '</button>';
  }

  function emailTierNames(rows) {
    var standard = ['Tier 1', 'Tier 2', 'Tier 3'], seen = {};
    (rows || []).forEach(function(row) { seen[String(row.tier || 'Unassigned').trim() || 'Unassigned'] = true; });
    var extras = Object.keys(seen).filter(function(tier) { return standard.indexOf(tier) === -1; }).sort(function(a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
    // Preserve the familiar Tier 1-3 email layout, then include any genuine
    // extra tier so the tier totals can never silently omit a detail row.
    return standard.concat(extras);
  }

  function emailStateSummary(rows, networkLabel, options) {
    var groups = {}, grand = specialStatusSummary(rows);
    (rows || []).forEach(function(row) { var key = row.state || 'Unassigned'; if (!groups[key]) groups[key] = []; groups[key].push(row); });
    var body = summaryOrderedGroupNames(groups, summaryNetworkKey(networkLabel, rows)).map(function(name) {
      var value = specialStatusSummary(groups[name]);
      return '<tr><td>' + escapeHtml(name) + '</td><td>' + formatNumber(value.red) + '</td><td>' + formatNumber(value.yellow) + '</td><td>' + formatNumber(value.green) + '</td><td><strong>' + formatNumber(value.total) + '</strong></td></tr>';
    }).join('');
    var lead = '<p class="email-section-lead"><strong>Below is the ' + escapeHtml(networkLabel) + ' state summary:</strong></p>';
    if (options && options.localFilter) lead = '<div class="email-local-summary-heading">' + lead + b2cStateSummaryFilterMarkup() + '</div>';
    return lead + '<table class="email-table email-state-summary"><thead><tr><th>State</th><th>' + emailStatusDot('red') + '</th><th>' + emailStatusDot('yellow') + '</th><th>' + emailStatusDot('green') + '</th><th>Grand Total</th></tr></thead><tbody>' + body + '<tr class="email-total-row"><td><strong>Grand Total</strong></td><td><strong>' + formatNumber(grand.red) + '</strong></td><td><strong>' + formatNumber(grand.yellow) + '</strong></td><td><strong>' + formatNumber(grand.green) + '</strong></td><td><strong>' + formatNumber(grand.total) + '</strong></td></tr></tbody></table>';
  }

  function emailTierSummary(rows, networkLabel) {
    var regions = {}, tiers = emailTierNames(rows);
    (rows || []).forEach(function(row) { var region = row.region || 'Unassigned'; if (!regions[region]) regions[region] = []; regions[region].push(row); });
    var body = summaryOrderedRegions(regions).map(function(region) {
      var cells = tiers.map(function(tier) { var summary = specialStatusSummary(regions[region].filter(function(row) { return row.tier === tier; })); return '<td>' + formatNumber(summary.red) + '</td><td>' + formatNumber(summary.yellow) + '</td><td>' + formatNumber(summary.green) + '</td><td class="email-tier-total"><strong>' + formatNumber(summary.total) + '</strong></td>'; }).join('');
      return '<tr><td>' + escapeHtml(region) + '</td>' + cells + '<td class="email-tier-total"><strong>' + formatNumber(specialStatusSummary(regions[region]).total) + '</strong></td></tr>';
    }).join('');
    var tierTotals = tiers.map(function(tier) { return specialStatusSummary((rows || []).filter(function(row) { return row.tier === tier; })); }), grand = specialStatusSummary(rows);
    var totalCells = tierTotals.map(function(summary) { return '<td><strong>' + formatNumber(summary.red) + '</strong></td><td><strong>' + formatNumber(summary.yellow) + '</strong></td><td><strong>' + formatNumber(summary.green) + '</strong></td><td class="email-tier-total"><strong>' + formatNumber(summary.total) + '</strong></td>'; }).join('');
    var tierHeaders = tiers.map(function(tier) { return '<th colspan="4">' + escapeHtml(tier) + '</th>'; }).join('');
    var statusHeaders = tiers.map(function() { return '<th>' + emailStatusDot('red') + '</th><th>' + emailStatusDot('yellow') + '</th><th>' + emailStatusDot('green') + '</th><th>Total</th>'; }).join('');
    return '<p class="email-section-lead"><strong>Below is the ' + escapeHtml(networkLabel) + ' summary by Tier by region:</strong></p><div class="email-table-scroll"><table class="email-table email-tier-matrix"><thead><tr><th rowspan="2">Region</th>' + tierHeaders + '<th rowspan="2">Grand Total</th></tr><tr>' + statusHeaders + '</tr></thead><tbody>' + body + '<tr class="email-total-row"><td><strong>Grand Total</strong></td>' + totalCells + '<td><strong>' + formatNumber(grand.total) + '</strong></td></tr></tbody></table></div>';
  }

  function emailPitstopDetails(rows, networkLabel) {
    var sorted = summaryOrderedPitstops(rows, networkLabel), states = Array.from(new Set(sorted.map(function(row) { return row.state; })));
    var groups = states.map(function(stateName) {
      var stateRows = sorted.filter(function(row) { return row.state === stateName; });
      var body = stateRows.map(function(row, index) { return '<tr><td>' + (index + 1) + '</td><td>' + escapeHtml(row.name) + '</td><td>' + escapeHtml(String(row.region || '').toUpperCase()) + '</td><td>' + escapeHtml(emailSummaryStateLabel(row.state)) + '</td><td>' + escapeHtml(row.tier) + '</td><td>' + formatNumber(row.target) + '</td><td>' + formatNumber(row.sales) + '</td><td>' + emailStatusDot(row.status) + '</td></tr>'; }).join('');
      var stateBandStyle = ' bgcolor="#cee5d4" style="background-color:#cee5d4"';
      return '<tbody class="email-state-group"><tr class="email-state-title"><td' + stateBandStyle + ' aria-hidden="true"></td><th' + stateBandStyle + ' scope="row">' + escapeHtml(emailSummaryStateLabel(stateName)) + '</th><td' + stateBandStyle + ' aria-hidden="true"></td><td' + stateBandStyle + ' aria-hidden="true"></td><td' + stateBandStyle + ' aria-hidden="true"></td><td' + stateBandStyle + ' aria-hidden="true"></td><td' + stateBandStyle + ' aria-hidden="true"></td><td' + stateBandStyle + ' aria-hidden="true"></td></tr><tr class="email-column-row"><th>No</th><th>Name</th><th>Region</th><th>State</th><th>Tier</th><th>Target</th><th>Total Sales</th><th>Achievement</th></tr>' + body + '</tbody>';
    }).join('');
    return '<p class="email-section-lead"><strong>Below are the ' + escapeHtml(networkLabel) + ' state details:</strong></p><div class="email-table-scroll"><table class="email-table email-detail-table email-state-detail-table">' + emailDetailColumnGroup() + (groups || '<tbody><tr><td>No pitstop data is available.</td></tr></tbody>') + '</table></div>';
  }

  // Email-ready ranking tables.  These use the same snapshot rows as the
  // state/tier/detail sections, so names, targets, sales and status always
  // reconcile with the rest of the report.  Top 3 is ranked by achievement
  // first (then sales); the bottom set is selected by the lowest achievement.
  function emailWeeklyTopBottom(rows, networkLabel, options) {
    var source = (rows || []).filter(function(row) { return row && row.name; }).map(function(row) {
      var target = numberValue(row.target), sales = numberValue(row.sales), achievement = target > 0 ? sales / target * 100 : 0;
      return Object.assign({}, row, { target: target, sales: sales, achievement: achievement });
    });
    var ranked = source.slice().sort(function(a, b) {
      return b.achievement - a.achievement || b.sales - a.sales || String(a.name).localeCompare(String(b.name));
    });
    var top = ranked.slice(0, 3);
    var bottom = ranked.slice().sort(function(a, b) {
      return a.achievement - b.achievement || a.sales - b.sales || String(a.name).localeCompare(String(b.name));
    }).slice(0, 3).sort(function(a, b) {
      return b.sales - a.sales || b.achievement - a.achievement || String(a.name).localeCompare(String(b.name));
    });
    var table = function(title, items, tone) {
      var body = items.map(function(row, index) {
        return '<tr><td>' + (index + 1) + '</td><td>' + escapeHtml(row.name) + '</td><td>' + escapeHtml(row.region || '') + '</td><td>' + escapeHtml(row.state || '') + '</td><td>' + escapeHtml(row.tier || '') + '</td><td>' + formatNumber(row.target) + '</td><td>' + formatNumber(row.sales) + '</td><td>' + emailStatusDot(row.status) + '</td></tr>';
      }).join('');
      return '<table class="email-table email-detail-table email-ranking-table ' + tone + '">' + emailDetailColumnGroup() + '<thead><tr><th colspan="8">' + title + '</th></tr><tr class="email-column-row"><th>No</th><th>Name</th><th>Region</th><th>State</th><th>Tier</th><th>Target</th><th>Total Sales</th><th>Achievement</th></tr></thead><tbody>' + (body || '<tr><td colspan="8">' + escapeHtml(options && options.emptyMessage || 'No pitstop data is available.') + '</td></tr>') + '</tbody></table>';
    };
    var displayLabel = networkLabel === 'BP' ? 'BP' : 'Pitstop';
    var collapsed = !!state.emailRankingCollapsed;
    return '<div class="email-ranking-section"' + (collapsed ? ' hidden' : '') + '>' + (options && options.showFilter ? weeklyRankingFilterMarkup() : '') + '<p class="email-section-lead"><strong>Below is Weekly Top 3 &amp; Bottom 3 by ' + escapeHtml(displayLabel) + ':</strong></p><div class="email-ranking-tables">' + table(displayLabel.toUpperCase() + ' TOP 3', top, 'email-ranking-top') + table(displayLabel.toUpperCase() + ' BOTTOM 3', bottom, 'email-ranking-bottom') + '</div></div>';
  }

  function emailIndonesiaHeader(includeDate) {
    return '<thead><tr>' + (includeDate ? '<th rowspan="3">Date</th>' : '') + '<th rowspan="3">Pitstop</th><th rowspan="3">Total Lead</th><th rowspan="3">Pending Lead</th><th rowspan="3">Cancelled Lead</th><th colspan="6">' + (includeDate ? 'Daily Sales' : 'Total Month Sales') + '</th><th colspan="2" rowspan="2">Total Sales</th><th colspan="2" rowspan="2">Conversion rate</th></tr><tr><th colspan="4">Bateriku Sales</th><th colspan="2">Partner Sales</th></tr><tr><th>Jumpstart</th><th>Charge</th><th>Warranty</th><th>Battery</th><th>Jumpstart</th><th>Battery</th><th>Jumpstart</th><th>Battery</th><th>Jumpstart</th><th>Battery</th></tr></thead>';
  }

  function emailIndonesiaRow(row, includeDate) {
    var jumpstart = indonesiaJumpstart(row), battery = indonesiaBattery(row);
    return '<tr>' + (includeDate ? '<td>' + escapeHtml(formatSummaryDate(row.date)) + '</td>' : '') + '<td>' + escapeHtml(row.pitstop) + '</td><td>' + formatNumber(row.totalLead) + '</td><td>' + formatNumber(row.pendingLead) + '</td><td>' + formatNumber(row.cancelledLead) + '</td><td>' + formatNumber(row.baterikuJumpstart) + '</td><td>' + formatNumber(row.baterikuCharge) + '</td><td>' + formatNumber(row.baterikuWarranty) + '</td><td>' + formatNumber(row.baterikuBattery) + '</td><td>' + formatNumber(row.partnerJumpstart) + '</td><td>' + formatNumber(row.partnerBattery) + '</td><td>' + formatNumber(jumpstart) + '</td><td>' + formatNumber(battery) + '</td><td>' + indonesiaRate(jumpstart, row.totalLead) + '</td><td>' + indonesiaRate(battery, row.totalLead) + '</td></tr>';
  }

  // Email state and tier summaries are daily snapshots, not period totals.
  // A location can occasionally appear more than once in a source response;
  // combine its sales, but keep one authoritative daily target from Pitstop
  // Master so duplicate source lines cannot inflate the target.
  function aggregateEmailPitstopSnapshot(rows) {
    var groups = {};
    (rows || []).forEach(function(row) {
      var channel = canonicalChannel(row.channel || 'HQ'), name = String(row.name || 'Unnamed pitstop').trim(), key = channel + '::' + name.toUpperCase();
      var group = groups[key];
      if (!group) group = Object.assign({}, row, { channel: channel, name: name, target: 0, sales: 0 });
      group.sales += numberValue(row.sales);
      // Tier-derived Master targets are 12 / 9 / 7. Keep a single target for
      // the location rather than summing it when a source contains duplicates.
      var masterTarget = targetForTier(row.tier);
      group.target = masterTarget || Math.max(numberValue(group.target), numberValue(row.target));
      group.region = row.region || group.region;
      group.state = row.state || group.state;
      group.tier = row.tier || group.tier;
      group.date = row.date || group.date;
      groups[key] = group;
    });
    return Object.keys(groups).map(function(key) {
      var row = groups[key], achievement = row.target > 0 ? Math.round(row.sales / row.target * 100) : 0;
      row.achievement = achievement;
      row.variance = row.sales - row.target;
      row.status = pitstopStatusValue(row.sales, row.target);
      return row;
    });
  }

  function emailLatestPitstopSnapshot(reportDate, options) {
    var rows = state.data.pitstops || [], hasDatedRows = rows.some(function(row) { return !!row.date; });
    var weekendAverage = !!(options && options.weekendAverage), weekendWindow = weekendAverage ? weekendAverageWindow(reportDate) : null;
    var localPeriod = !weekendAverage && options && options.periodFrom !== undefined;
    var localSalesMap = localPeriod && options && options.salesMap ? options.salesMap : null;
    var selectedFrom = weekendAverage ? weekendWindow.from : localPeriod ? String(options.periodFrom || '') : state.from;
    var selectedTo = weekendAverage ? weekendWindow.to : localPeriod && options.periodTo !== undefined ? String(options.periodTo || '') : reportDate;
    var datedRows = rows.filter(function(row) { return !!row.date && (!selectedFrom || row.date >= selectedFrom) && (!selectedTo || row.date <= selectedTo); });
    // Summary's optional Weekend Average mode is a three-day operational
    // snapshot.  Use every row in the selected Fri-Sun window, then divide
    // each pitstop's sales by three and round once.  This keeps every detail,
    // state summary, tier summary, and ranking table on the same number.
    var weekendDays = weekendAverage ? (weekendWindow.days || 3) : 1;
    // Hosted weekend figures come from their own Fri-Sun Grafana request.
    // Start with Pitstop Master metadata so every active location stays in
    // the required state/order layout, then overlay and average live sales.
    if (weekendAverage && HOSTED_MODE) {
      var masterSnapshot = (state.data.pitstopMaster || []).filter(function(row) { return row.active && row.malaysia; }).map(function(row) {
        var target = targetForTier(row.tier) || numberValue(row.target);
        return {
          date: reportDate || weekendWindow.to,
          channel: canonicalChannel(row.channel || 'HQ'),
          name: row.name,
          region: row.region,
          state: row.state,
          tier: row.tier,
          target: target,
          sales: 0,
          achievement: 0,
          variance: -target,
          status: 'red',
          masterId: row.id || '',
          masterMatched: true
        };
      });
      var weekendMap = state.weekendPitstopSyncKey === weekendWindow.key ? state.weekendPitstopSalesByKey : null;
      return applyGrafanaSummarySales(masterSnapshot, { weekendAverage: true, days: weekendDays, useMap: true, salesMap: weekendMap });
    }
    // Local Summary shortcuts use their own exact Grafana range. Build from
    // Pitstop Master so every active location remains visible, overlay the
    // range sales, and accumulate the daily tier target once per selected day
    // (Tier 1 = 12, Tier 2 = 9, Tier 3 = 7).
    if (HOSTED_MODE && localPeriod && !localSalesMap) return [];
    if (localSalesMap) {
      var localDays = grafanaDateRange(selectedFrom, selectedTo).length || 1;
      var localMasterSnapshot = (state.data.pitstopMaster || []).filter(function(row) { return row.active && row.malaysia; }).map(function(row) {
        var dailyTarget = targetForTier(row.tier) || numberValue(row.target), target = dailyTarget * localDays;
        return {
          date: selectedTo || reportDate,
          channel: canonicalChannel(row.channel || 'HQ'),
          name: row.name,
          region: row.region,
          state: row.state,
          tier: row.tier,
          target: target,
          sales: 0,
          achievement: 0,
          variance: -target,
          status: 'red',
          masterId: row.id || '',
          masterMatched: true
        };
      });
      if (localMasterSnapshot.length) return applyGrafanaSummarySales(localMasterSnapshot, { salesMap: localSalesMap, zeroUnmatched: true });
    }
    // Once dated data exists, never fall back to all dates. That previously
    // combined unrelated daily targets and sales when the selected range was
    // empty. Undated rows remain supported only for legacy snapshot uploads.
    if (!datedRows.length) return hasDatedRows ? [] : applyGrafanaSummarySales(aggregateEmailPitstopSnapshot(rows.filter(function(row) { return !row.date; })), { weekendAverage: weekendAverage, days: weekendDays, useMap: !weekendAverage });
    var snapshotDate = datedRows.map(function(row) { return row.date; }).sort().pop();
    var snapshot = aggregateEmailPitstopSnapshot(weekendAverage || localPeriod ? datedRows : datedRows.filter(function(row) { return row.date === snapshotDate; }));
    if (weekendAverage) {
      snapshot.forEach(function(row) {
        row.date = reportDate || snapshotDate;
        row.target = targetForTier(row.tier) || numberValue(row.target);
      });
      // The hosted map represents the complete selected report range. Weekend
      // averaging must instead use only the daily Fri-Sun rows selected above.
      return applyGrafanaSummarySales(snapshot, { weekendAverage: true, days: weekendDays, useMap: false });
    }
    // Summary is a period report: tier targets accumulate once per selected
    // calendar day (Tier 1 = 12/day, Tier 2 = 9/day, Tier 3 = 7/day).
    // The live panel sales are already aggregated for the selected range, so
    // compare them with the accumulated target rather than a one-day target.
    var targetDays = grafanaDateRange(selectedFrom || snapshotDate, selectedTo || reportDate || snapshotDate).length || 1;
    snapshot.forEach(function(row) {
      row.target = numberValue(row.target) * targetDays;
      row.achievement = row.target > 0 ? Math.round(numberValue(row.sales) / row.target * 100) : 0;
      row.variance = numberValue(row.sales) - row.target;
      row.status = pitstopStatusValue(row.sales, row.target);
    });
    return applyGrafanaSummarySales(snapshot, localPeriod ? { useMap: false } : undefined);
  }

  // Summary detail rows keep Pitstop Master metadata, but their sales must
  // come from the same live HQ/BP performance panels as Pitstop Explorer.
  // Overlay by canonical channel + name and recalculate status from the
  // displayed sales so Total Sales, achievement, and the status dot agree.
  function applyGrafanaSummarySales(rows, options) {
    var hasExplicitMap = !!(options && Object.prototype.hasOwnProperty.call(options, 'salesMap'));
    var map = hasExplicitMap ? options.salesMap : state.grafanaPitstopSalesByKey;
    var weekendAverage = !!(options && options.weekendAverage), weekendDays = Math.max(1, numberValue(options && options.days) || 3), useMap = !(options && options.useMap === false), zeroUnmatched = !!(options && options.zeroUnmatched);
    if (!HOSTED_MODE || !useMap || !map) {
      if (!weekendAverage) return rows;
      return (rows || []).map(function(row) {
        var target = targetForTier(row.tier) || numberValue(row.target), sales = Math.round(numberValue(row.sales) / weekendDays), achievement = target > 0 ? Math.round(sales / target * 100) : 0;
        row.target = target;
        row.sales = sales;
        row.achievement = achievement;
        row.variance = sales - target;
        row.status = pitstopStatusValue(sales, target);
        return row;
      });
    }
    return (rows || []).map(function(row) {
      var channel = canonicalChannel(row.channel || 'HQ'), matchedKey = '';
      // Warehouse rows are part of the HQ/B2C network.  Grafana's HQ panel
      // can label them as HQ, while Pitstop Master correctly labels the row
      // WH. Try both channel aliases before leaving the displayed sales at 0.
      var channels = channel === 'WH' ? ['WH', 'HQ'] : channel === 'HQ' ? ['HQ', 'WH'] : [channel];
      pitstopMatchKeys(row.name).some(function(nameKey) {
        return channels.some(function(candidateChannel) {
          var candidate = candidateChannel + '::' + nameKey;
          if (Object.prototype.hasOwnProperty.call(map, candidate)) { matchedKey = candidate; return true; }
          return false;
        });
      });
      if (!matchedKey) {
        if (zeroUnmatched) {
          var zeroTarget = numberValue(row.target), zeroAchievement = 0;
          row.sales = 0;
          row.achievement = zeroAchievement;
          row.variance = -zeroTarget;
          row.status = pitstopStatusValue(0, zeroTarget);
          return row;
        }
        // Keep unmatched Master rows visible even when the live overlay does
        // not contain a name. In Weekend Average mode they still use the
        // same rounded fallback calculation as matched rows.
        if (weekendAverage) {
          var fallbackTarget = targetForTier(row.tier) || numberValue(row.target), fallbackSales = Math.round(numberValue(row.sales) / weekendDays), fallbackAchievement = fallbackTarget > 0 ? Math.round(fallbackSales / fallbackTarget * 100) : 0;
          row.target = fallbackTarget;
          row.sales = fallbackSales;
          row.achievement = fallbackAchievement;
          row.variance = fallbackSales - fallbackTarget;
          row.status = pitstopStatusValue(fallbackSales, fallbackTarget);
        }
        return row;
      }
      var sales = numberValue(map[matchedKey]), target = weekendAverage ? (targetForTier(row.tier) || numberValue(row.target)) : numberValue(row.target);
      if (weekendAverage) sales = Math.round(sales / weekendDays);
      var achievement = target > 0 ? Math.round(sales / target * 100) : 0;
      row.target = target;
      row.sales = sales;
      row.achievement = achievement;
      row.variance = sales - target;
      row.status = pitstopStatusValue(sales, target);
      return row;
    });
  }

  function emailLatestBGarageSnapshot(reportDate) {
    return aggregateBGarageRows(bgarageRowsForWindow(reportDate, reportDate));
  }

  function emailGrafanaSalesRows() {
    var rangeKey = (state.from || '') + '::' + (state.to || '');
    if (HOSTED_MODE) {
      // Always apply the browser's selected bounds as a final guard. Grafana
      // can return a wider frame for preset requests (especially 7/14 days),
      // and stale rows must never leak into the Summary header table.
      var orderRows = state.emailSalesSyncRange === rangeKey ? (state.grafanaEmailSalesRows || []).filter(function(row) { return row && row.date && (!state.from || row.date >= state.from) && (!state.to || row.date <= state.to); }).slice().sort(function(a, b) { return a.date.localeCompare(b.date); }) : [];
      return orderRows;
    }
    var grouped = {};
    (state.data.pitstops || []).forEach(function(row) {
      if (!row.date || (state.from && row.date < state.from) || (state.to && row.date > state.to)) return;
      var channel = canonicalChannel(row.channel);
      if (channel !== 'HQ' && channel !== 'BP') return;
      if (!grouped[row.date]) grouped[row.date] = { date: row.date, b2c: 0, b2b2c: 0 };
      if (channel === 'HQ') grouped[row.date].b2c += numberValue(row.sales);
      if (channel === 'BP') grouped[row.date].b2b2c += numberValue(row.sales);
    });
    return Object.keys(grouped).sort().map(function(date) { return grouped[date]; });
  }

  function priorEmailSalesRow() {
    var rows = HOSTED_MODE ? (state.grafanaEmailSalesRows || []) : (state.data.dailySales || []);
    return rows.filter(function(row) { return row && row.date && state.from && row.date < state.from; }).sort(function(a, b) { return a.date.localeCompare(b.date); }).pop() || null;
  }

  // The Monday email can use a special weekend-average view without changing
  // the shared dashboard range or the operational pitstop calculations. The
  // default window is Friday-Sunday; if Thursday was a holiday it becomes
  // Thursday-Sunday and uses a four-day divisor.
  function isoWeekday(iso) {
    var date = new Date(String(iso || '') + 'T00:00:00Z');
    return Number.isNaN(date.getTime()) ? -1 : date.getUTCDay();
  }

  function weekendAverageWindow(reportDate) {
    var end = reportDate || state.to || lastDate(), guard = 0;
    while (end && isoWeekday(end) !== 0 && guard < 8) { end = shiftIsoDate(end, -1); guard += 1; }
    var days = 3;
    return { from: end ? shiftIsoDate(end, -(days - 1)) : '', to: end || '', days: days, key: (end ? shiftIsoDate(end, -(days - 1)) : '') + '::' + (end || '') + '::' + days };
  }

  function weekendAverageSourceRows(window) {
    var source = HOSTED_MODE && state.weekendSalesSyncKey === window.key ? state.weekendSalesRows : HOSTED_MODE ? [] : (state.data.dailySales || []);
    return (source || []).filter(function(row) { return row && row.date && row.date >= window.from && row.date <= window.to; }).slice().sort(function(a, b) { return a.date.localeCompare(b.date); });
  }

  function weekendAverageSnapshot(reportDate) {
    var window = weekendAverageWindow(reportDate), rows = weekendAverageSourceRows(window), sums = { b2c: 0, b2b2c: 0 };
    rows.forEach(function(row) { sums.b2c += numberValue(row.b2c); sums.b2b2c += numberValue(row.b2b2c); });
    if (!rows.length) return { window: window, rows: [], sourceRows: rows, averageTotal: 0 };
    var average = { date: window.to, displayDate: formatDate(window.from, true) + ' – ' + formatDate(window.to, true), b2c: Math.round(sums.b2c / window.days), b2b2c: Math.round(sums.b2b2c / window.days) };
    average.total = totalSales(average);
    // Treat the averaged weekend block like one daily observation for
    // movement: compare it with the immediately preceding day (for example,
    // Friday-Sunday compares with Thursday). Never label the movement cell as
    // "Weekend average"; the date range already communicates that context.
    var priorDate = shiftIsoDate(window.from, -1), priorSource = HOSTED_MODE ? (state.grafanaEmailSalesRows || []) : (state.data.dailySales || []), priorRow = priorSource.filter(function(row) { return row && row.date === priorDate; }).pop(), priorTotal = priorRow ? totalSales(priorRow) : null;
    average.movement = priorRow ? (average.total >= priorTotal ? 'Increase' : 'Decrease') : 'First day';
    average.priorAverage = priorTotal;
    return { window: window, rows: [average], sourceRows: rows, averageTotal: average.total };
  }

  // Keep the complete selected report period visible while replacing every
  // complete Friday-Sunday block with one averaged row. This is important for
  // Whole month (and longer ranges): users still see every ordinary day, while
  // each weekend block is represented exactly once.
  function weekendAverageSalesRows(normalRows, snapshot) {
    var rows = (normalRows || []).slice().sort(function(a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    if (!snapshot || !snapshot.window || !snapshot.rows || !snapshot.rows.length) return rows;
    var latestWindow = snapshot.window, result = [], consumed = {};
    var averageBlock = function(blockRows, from, to, preferred) {
      if (preferred) return Object.assign({}, preferred, { date: from, displayDate: formatDate(from, true) + ' – ' + formatDate(to, true), weekendAverage: true });
      var sums = { b2c: 0, b2b2c: 0 };
      blockRows.forEach(function(row) { sums.b2c += numberValue(row.b2c); sums.b2b2c += numberValue(row.b2b2c); });
      var average = { date: from, displayDate: formatDate(from, true) + ' – ' + formatDate(to, true), b2c: Math.round(sums.b2c / 3), b2b2c: Math.round(sums.b2b2c / 3), weekendAverage: true };
      average.total = totalSales(average);
      var priorDate = shiftIsoDate(from, -1), prior = rows.filter(function(row) { return row.date === priorDate; }).pop();
      average.movement = prior ? (average.total >= totalSales(prior) ? 'Increase' : 'Decrease') : 'First day';
      average.priorAverage = prior ? totalSales(prior) : null;
      return average;
    };
    rows.forEach(function(row) {
      var date = String(row.date || '');
      if (consumed[date]) return;
      if (isoWeekday(date) === 5) {
        var to = shiftIsoDate(date, 2), blockRows = rows.filter(function(candidate) { return candidate.date >= date && candidate.date <= to; }), preferred = date === latestWindow.from && to === latestWindow.to ? snapshot.rows[0] : null;
        // Only collapse a complete Friday-Sunday block. A range beginning on
        // Saturday or ending on Friday keeps that partial block as daily rows.
        if (blockRows.length === 3 && blockRows.every(function(candidate) { return candidate.date === date || candidate.date === shiftIsoDate(date, 1) || candidate.date === to; })) {
          result.push(averageBlock(blockRows, date, to, preferred));
          blockRows.forEach(function(candidate) { consumed[candidate.date] = true; });
          return;
        }
      }
      result.push(row);
    });
    return result;
  }

  function weekendAverageButton() {
    var active = !!state.weekendAverageActive;
    return '<button type="button" class="header-button email-ranking-toggle email-weekend-toggle ' + (active ? 'is-active' : '') + '" data-weekend-average-toggle aria-pressed="' + active + '">' + (active ? 'Disable weekend average' : 'Weekend average (Fri–Sun)') + '</button>';
  }

  function weekendAverageStatus(reportDate) {
    if (!state.weekendAverageActive) return '';
    var window = weekendAverageWindow(reportDate), ready = state.weekendPitstopSyncKey === window.key && state.weekendPitstopSalesByKey && Object.keys(state.weekendPitstopSalesByKey).length;
    var status = state.weekendSalesLoading || (!ready && !state.weekendSalesError) ? 'Loading Fri–Sun pitstop sales from Grafana…' : state.weekendSalesError ? ('Weekend sales unavailable: ' + state.weekendSalesError) : ('Using ' + formatDate(window.from, true) + ' to ' + formatDate(window.to, true) + ' · total sales divided by 3 days.');
    var note = status + ' Applies only to the B2C/BP tier-by-region and state-detail tables. Daily sales, state summaries, and weekly rankings remain unchanged. Daily tier targets: Tier 1 = 12, Tier 2 = 9, Tier 3 = 7.';
    return '<div class="weekend-average-control ' + (state.weekendSalesError ? 'has-error' : '') + '" role="status"><span class="weekend-average-note">' + escapeHtml(note) + '</span></div>';
  }

  async function syncWeekendAverageSales() {
    if (!HOSTED_MODE || !state.weekendAverageActive || ['special', 'summary-header'].indexOf(state.view) === -1) return;
    var reportDate = state.to || lastDate(), window = weekendAverageWindow(reportDate), rangeKey = window.key;
    if (!window.from || !window.to || state.weekendSalesSyncKey === rangeKey || (weekendSalesRequest && weekendSalesRequest.key === rangeKey)) return;
    if (weekendSalesRequest && weekendSalesRequest.key !== rangeKey) weekendSalesRequest.controller.abort();
    var controller = new AbortController(), request = { key: rangeKey, controller: controller };
    weekendSalesRequest = request;
    state.weekendSalesLoading = true;
    state.weekendSalesError = '';
    render();
    try {
      var payload = await fetchPitstopPerformance(window.from, window.to, controller.signal);
      if (weekendSalesRequest === request) {
        var weekendMap = grafanaPitstopSalesMap(payload);
        if (!Object.keys(weekendMap).length) throw new Error('Grafana returned no matched pitstop sales for the selected Friday–Sunday period.');
        state.weekendPitstopSalesByKey = weekendMap;
        state.weekendPitstopSyncKey = rangeKey;
        state.weekendSalesSyncKey = rangeKey;
      }
    } catch (error) {
      if (!error || error.name !== 'AbortError') state.weekendSalesError = error && error.message || 'Weekend sales could not be loaded.';
    } finally {
      if (weekendSalesRequest === request) weekendSalesRequest = null;
      if (weekendSalesRequest === null) { state.weekendSalesLoading = false; render(); }
    }
  }

  function scheduleWeekendSalesSync(delay) {
    if (!HOSTED_MODE || !state.weekendAverageActive || ['special', 'summary-header'].indexOf(state.view) === -1) return;
    window.clearTimeout(scheduleWeekendSalesSync.timer);
    scheduleWeekendSalesSync.timer = window.setTimeout(syncWeekendAverageSales, delay || 0);
  }

  function isSummaryView(view) {
    return ['special', 'summary-header', 'operations-summary', 'bgarage-summary', 'indonesia-summary'].indexOf(view || state.view) !== -1;
  }

  function summaryDirtyKey(view) {
    if (view === 'operations-summary' || view === 'special') return 'operations';
    if (view === 'bgarage-summary') return 'bgarage';
    if (view === 'indonesia-summary') return 'indonesia';
    return '';
  }

  function summaryCopyBlockReason(ignoreSnapshot) {
    var view = state.view;
    if (!isSummaryView(view)) return '';
    if (state.cloudLoading) return 'Data refresh is still running.';
    if (state.cloudError) return 'The current workbook could not be verified.';
    // Full Summary may be copied while the independently maintained BGarage
    // or Indonesia inputs are unavailable. Their standalone reports and the
    // finalisation readiness checks remain deliberately strict.
    var blockingFallbacks = Object.keys(state.sourceFallbacks).filter(function(key) {
      return view !== 'special' || (key !== 'bgarageManual' && key !== 'indonesiaManual');
    });
    if (blockingFallbacks.length) return 'A live source is unavailable; refresh successfully before copying cached data.';
    if ((view === 'special' || view === 'summary-header') && state.emailSalesLoading) return 'Sales data is still loading.';
    if ((view === 'special' || view === 'summary-header') && HOSTED_MODE && !emailGrafanaSalesRows().length) return state.emailSalesError || 'Sales data is not ready.';
    if (view === 'special') {
      var summaryWindow = b2cStateSummaryWindow();
      if (state.summaryNetworkLoading || state.weekendSalesLoading) return 'Pitstop performance data is still loading.';
      if (!summaryNetworkDataReady(summaryWindow)) return state.summaryNetworkError || 'Pitstop performance data is not ready.';
      var weeklyWindow = weeklyRankingWindow();
      if (!state.emailRankingCollapsed && state.weeklyRankingPreset === 'previous-week' && !weeklyRankingDataReady(weeklyWindow)) return state.weeklyRankingError || 'Weekly ranking sales are still loading.';
    }
    if (view === 'special' || view === 'operations-summary') {
      if (!state.manualSourcesReady.rsa || !state.manualSourcesReady.b2w || state.rsaLoading || state.b2wLoading) return 'RSA and B2W values are still loading.';
      if (state.resqLoading || state.warrantyLoading) return 'Operations data is still loading.';
      if (state.rsaError || state.b2wError) return state.rsaError || state.b2wError;
      if (HOSTED_MODE && (!state.resqApiAvailable || !state.warrantyApiAvailable || state.resqSyncRange !== selectedRangeKey() || state.warrantySyncRange !== selectedRangeKey())) return state.resqError || state.warrantyError || 'ResQ or Warranty data is not ready.';
      if (state.manualServiceSaving || state.b2wSyncing) return 'RSA and B2W changes are still being saved.';
    }
    if (view === 'bgarage-summary') {
      if (!state.manualSourcesReady.bgarage) return 'BGarage values are still loading.';
      if (state.bgarageValuesError) return state.bgarageValuesError;
      if (state.bgarageSummarySaving) return 'BGarage changes are still being saved.';
    }
    if (view === 'indonesia-summary') {
      if (!state.manualSourcesReady.indonesia) return 'Indonesia values are still loading.';
      if (state.indonesiaValuesError) return state.indonesiaValuesError;
      if (state.indonesiaSummarySaving) return 'Indonesia changes are still being saved.';
    }
    // Full Summary can be copied with incomplete RSA/B2W inputs. The
    // readiness checklist names the missing days, while finalisation and the
    // operations-only summary continue to require complete values.
    if (view === 'operations-summary') {
      var incomplete = rowsInRange().filter(function(row) { return ['rsaJumpstart', 'rsaTyrePatch', 'rsaFuel', 'b2w'].some(function(field) { return !Number.isFinite(row[field]); }); });
      if (incomplete.length) return 'RSA/B2W entries are incomplete for ' + incomplete.length + ' day(s), starting ' + formatSummaryDate(incomplete[0].date) + '. Enter zero only when confirmed.';
    }
    if (view === 'bgarage-summary' && !bgarageRowsForWindow(manualEntryDate('bgarage'), manualEntryDate('bgarage')).length) return 'Save this BGarage reporting date before copying.';
    if (view === 'indonesia-summary' && !indonesiaRowsForWindow(manualEntryDate('indonesia'), manualEntryDate('indonesia')).length) return 'Save this Indonesia reporting date before copying.';
    if (view === 'special') {
      var audit = state.pitstopReconciliation[summaryNetworkRangeKey(b2cStateSummaryWindow())];
      if (audit && audit.excluded.length) return 'Resolve ' + audit.excluded.length + ' Grafana/Master mapping issue(s) before copying the network tables.';
    }
    var dirtyKey = summaryDirtyKey(view);
    if (dirtyKey && state.summaryDirty[dirtyKey]) return 'Save the edited values before copying.';
    if (!ignoreSnapshot) {
      var snapshot = state.summaryCopySnapshot;
      if (!snapshot || snapshot.view !== view || snapshot.revision !== state.summaryRenderRevision) return 'The report snapshot is still being prepared.';
    }
    return '';
  }

  function summaryCopyButton(label) {
    var reason = summaryCopyBlockReason(true);
    return '<button class="header-button email-copy-button" type="button" data-copy-email-summary' + (reason ? ' disabled title="' + escapeHtml(reason) + '"' : '') + '>' + escapeHtml(label) + '</button>';
  }

  function updateSummaryCopyButtons() {
    var reason = summaryCopyBlockReason(false);
    document.querySelectorAll('[data-copy-email-summary]').forEach(function(button) {
      button.disabled = !!reason;
      button.title = reason || 'Copy the completed report to Outlook';
      button.setAttribute('aria-label', reason ? ('Copy unavailable: ' + reason) : button.textContent.trim());
    });
  }

  function markSummaryDirty(kind) {
    if (!kind) return;
    captureSummaryDrafts();
    updateServiceDraftTotals();
    state.summaryCopySnapshot = null;
    updateSummaryCopyButtons();
  }

  function manualEntryDate(kind) {
    return kind === 'bgarage' ? normalizeBGarageSummaryDate(state.bgarageSummaryDate || bgarageSummaryLatestDate()) : normalizeIndonesiaSummaryDate(state.indonesiaSummaryDate || indonesiaSummaryLatestDate());
  }

  function draftInputInfo(input) {
    var kind = input.hasAttribute('data-b2w-input') ? 'b2w' : input.hasAttribute('data-rsa-input') ? 'rsa' : input.hasAttribute('data-bgarage-manual-input') ? 'bgarage' : 'indonesia';
    var date = input.getAttribute('data-' + kind + '-date') || manualEntryDate(kind);
    var field = input.getAttribute('data-rsa-field') || input.getAttribute('data-manual-field') || '';
    var recordKey = kind === 'rsa' ? date + ':' + field : date;
    var row = input.closest('tr'), entity = kind === 'bgarage' ? row && row.cells[0].textContent.trim() : kind === 'indonesia' ? row && row.cells[1].textContent.trim() : '';
    return { kind: kind, date: date, field: field, entity: entity || '', recordKey: recordKey, key: [kind, date, input.getAttribute('data-manual-section') || '', entity || input.getAttribute('data-manual-row') || '', field].join('|') };
  }

  function summaryDraftInputs() {
    return Array.from(document.querySelectorAll('[data-b2w-input], [data-rsa-input], [data-bgarage-manual-input], [data-indonesia-manual-input]'));
  }

  function syncSummaryDirty() {
    var drafts = Object.values(state.summaryDrafts);
    state.summaryDirty.operations = drafts.some(function(d) { return d.kind === 'b2w' || d.kind === 'rsa'; });
    state.summaryDirty.bgarage = drafts.some(function(d) { return d.kind === 'bgarage'; });
    state.summaryDirty.indonesia = drafts.some(function(d) { return d.kind === 'indonesia'; });
  }

  function restoreSummaryDrafts() {
    summaryDraftInputs().forEach(function(input) {
      var info = draftInputInfo(input), draft = state.summaryDrafts[info.key];
      input.dataset.savedValue = draft ? draft.baseValue : input.value;
      input.dataset.savedRevision = String(draft ? draft.revision : state.manualRevisions[info.kind][info.recordKey] || 0);
      if (draft) input.value = draft.value;
    });
  }

  function updateServiceDraftTotals() {
    document.querySelectorAll('.operations-rsa-table tbody tr').forEach(function(row) {
      var inputs = Array.from(row.querySelectorAll('[data-rsa-input]'));
      if (inputs.length !== 3 || !row.cells[4]) return;
      var values = inputs.map(function(input) { return input.value.trim() === '' ? NaN : Number(input.value); });
      row.cells[4].textContent = formatNumber(values.reduce(function(sum, value) { return sum + value; }, 0));
    });
  }

  function captureSummaryDrafts() {
    summaryDraftInputs().forEach(function(input) {
      var info = draftInputInfo(input), base = input.dataset.savedValue;
      if (base === undefined) return;
      var normalized = function(value) { return String(value).replace(/,/g, '').trim(); };
      if (normalized(input.value) === normalized(base)) delete state.summaryDrafts[info.key];
      else state.summaryDrafts[info.key] = Object.assign(info, { value: input.value, baseValue: base, revision: Number(input.dataset.savedRevision || 0) });
    });
    syncSummaryDirty();
    persistSummaryDrafts();
  }

  function clearSavedDrafts(kind, date, savedDrafts) {
    Object.keys(state.summaryDrafts).forEach(function(key) {
      var draft = state.summaryDrafts[key];
      if (draft.kind === kind && (!date || draft.date === date) && (!savedDrafts || savedDrafts[key] && savedDrafts[key].value === draft.value)) delete state.summaryDrafts[key];
    });
    syncSummaryDirty();
    persistSummaryDrafts();
  }

  function validWorkflowDate(date) {
    return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  }

  function reportCanonical(value) {
    if (Array.isArray(value)) return '[' + value.map(reportCanonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ':' + reportCanonical(value[key]); }).join(',') + '}';
    return JSON.stringify(value);
  }

  async function reportContentHash(value) {
    var bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reportCanonical(value)));
    return Array.from(new Uint8Array(bytes)).map(function(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }

  function persistSummaryDrafts() {
    try {
      if (Object.keys(state.summaryDrafts).length) localStorage.setItem(draftRecoveryKey, JSON.stringify({ format: 1, savedAt: new Date().toISOString(), drafts: state.summaryDrafts }));
      else localStorage.removeItem(draftRecoveryKey);
      draftStorageError = '';
    } catch (_) { draftStorageError = 'Draft recovery is unavailable in this browser. Save your changes before leaving.'; }
    updateWorkflowControls();
  }

  function readRecoverableDrafts() {
    recoveryCandidates = {}; recoverySourceKeys = [];
    try {
      Object.keys(localStorage).filter(function(key) { return key.indexOf(DRAFT_RECOVERY_PREFIX) === 0 && key !== draftRecoveryKey; }).forEach(function(key) {
        var saved;
        try { saved = JSON.parse(localStorage.getItem(key)); } catch (_) { return; }
        if (!saved || saved.format !== 1 || !saved.drafts || !Number.isFinite(Date.parse(saved.savedAt))) return;
        var valid = Object.entries(saved.drafts).filter(function(pair) {
          var d = pair[1];
          return d && d.key === pair[0] && pair[0].length < 500 && ['rsa', 'b2w', 'bgarage', 'indonesia'].indexOf(d.kind) !== -1 && validWorkflowDate(d.date) && typeof d.field === 'string' && /^[a-zA-Z]*$/.test(d.field) && typeof d.value === 'string' && d.value.length <= 160 && typeof d.baseValue === 'string' && d.baseValue.length <= 160 && Number.isInteger(d.revision) && d.revision >= 0;
        });
        if (!valid.length || valid.length > 10000) return;
        recoverySourceKeys.push(key);
        valid.forEach(function(pair) { if (!recoveryCandidates[pair[0]] || recoveryCandidates[pair[0]].savedAt < saved.savedAt) recoveryCandidates[pair[0]] = { draft: pair[1], savedAt: saved.savedAt }; });
      });
    } catch (_) { draftStorageError = 'Draft recovery is unavailable in this browser.'; }
  }

  function draftRecoveryMarkup() {
    var pending = Object.keys(recoveryCandidates).length, active = Object.keys(state.summaryDrafts).length;
    if (!pending && !active && !draftStorageError) return '';
    var message = draftStorageError || (pending ? pending + ' recoverable edit(s) on this browser.' : active + ' unsaved edit(s) backed up on this browser.');
    var list = draftReviewOpen && active ? '<div class="draft-review-list">' + Object.values(state.summaryDrafts).map(function(draft) {
      var label = draft.kind.toUpperCase() + ' | ' + formatSummaryDate(draft.date) + (draft.entity ? ' | ' + draft.entity : '') + (draft.field ? ' | ' + draft.field.replace(/([a-z])([A-Z])/g, '$1 $2') : '');
      return '<div class="draft-review-row"><span>' + escapeHtml(label) + '</span><span>' + escapeHtml(draft.baseValue || 'Blank') + ' &rarr; <strong>' + escapeHtml(draft.value || 'Blank') + '</strong></span><button class="header-button" data-workflow-action="review-draft" data-draft-key="' + escapeHtml(draft.key) + '">Review</button><button class="header-button" data-workflow-action="discard-draft" data-draft-key="' + escapeHtml(draft.key) + '">Discard</button></div>';
    }).join('') + '</div>' : '';
    return '<aside class="draft-recovery-bar" data-copy-exclude><span role="status">' + escapeHtml(message) + '</span><div>' + (pending ? '<button class="header-button" data-workflow-action="recover">Recover drafts</button><button class="header-button" data-workflow-action="discard-recovery">Discard recovery</button>' : '') + (active ? '<button class="header-button" data-workflow-action="review-drafts" aria-expanded="' + draftReviewOpen + '">' + (draftReviewOpen ? 'Hide edits' : 'Review edits') + '</button><button class="header-button" data-workflow-action="discard-drafts">Discard edits</button>' : '') + '</div>' + list + '</aside>';
  }

  function removeRecoverySources() {
    try { recoverySourceKeys.forEach(function(key) { localStorage.removeItem(key); }); recoveryCandidates = {}; recoverySourceKeys = []; }
    catch (_) { draftStorageError = 'Some recovery copies could not be removed. Your active edits are retained.'; }
  }

  async function recoverSummaryDrafts() {
    if (!Object.keys(recoveryCandidates).length) return;
    Object.keys(recoveryCandidates).forEach(function(key) { if (!state.summaryDrafts[key]) state.summaryDrafts[key] = recoveryCandidates[key].draft; });
    syncSummaryDirty(); persistSummaryDrafts();
    if (!draftStorageError) removeRecoverySources();
    render();
    openWorkflowIssue(Object.values(state.summaryDrafts)[0]);
    showToast('Drafts recovered, not saved. Newer server values remain protected by revision checks.');
  }

  async function openWorkflowIssue(issue) {
    if (!issue) return;
    if (issue.kind === 'bgarage' || issue.kind === 'indonesia') {
      state.view = issue.kind + '-summary';
      state[issue.kind + 'SummaryDate'] = issue.date;
    } else if (issue.kind === 'rsa' || issue.kind === 'b2w') {
      state.view = 'operations-summary';
      if (issue.date < state.from || issue.date > state.to) { state.from = issue.date; state.to = issue.date; state.range = 'custom'; }
    } else if (issue.kind === 'master') { window.location.assign(HOSTED_MODE ? '/upload/' : 'Data Upload Centre.html'); return; }
    else {
      var selector = issue.kind === 'pitstop' ? '[data-b2c-state-summary-range]' : issue.kind === 'emailSales' ? '.email-sales-table' : issue.kind === 'resq' ? '.operations-resq-table' : '.operations-warranty-table';
      var target = document.querySelector(selector);
      if (target) target.scrollIntoView({ block: 'center' });
      return;
    }
    state.summaryOpened = true;
    render();
    var view = state.view, rangeKey = selectedRangeKey();
    if (state.view === 'operations-summary') {
      if (state.resqSyncRange !== rangeKey) { window.clearTimeout(syncResqAfterFilter.timer); await syncResqAfterFilter(); }
      if (state.warrantySyncRange !== rangeKey) { window.clearTimeout(syncWarrantyAfterFilter.timer); await syncWarrantyAfterFilter(); }
    }
    if (state.view !== view || selectedRangeKey() !== rangeKey) return;
    var input = summaryDraftInputs().find(function(input) { var info = draftInputInfo(input); return info.kind === issue.kind && info.date === issue.date && (!issue.field || info.field === issue.field) && (!issue.entity || info.entity === issue.entity); });
    if (input) { input.scrollIntoView({ block: 'center' }); input.focus(); }
    else showToast('This draft field no longer matches a report row. Review or discard it; it has not been applied to another outlet.');
  }

  function reportReadiness() {
    var dates = grafanaDateRange(state.from, state.to), entries = [], drafts = Object.values(state.summaryDrafts), windowRange = b2cStateSummaryWindow();
    function add(kind, label, missing, unavailable, detail, field) {
      var pending = drafts.filter(function(d) { return d.kind === kind && (kind === 'bgarage' || kind === 'indonesia' ? d.date === state.to : d.date >= state.from && d.date <= state.to); });
      var reason = unavailable || (pending.length ? pending.length + ' unsaved edit(s)' : missing.length ? missing.length + ' incomplete day(s)' : detail);
      entries.push({ kind: kind, label: label, ready: !unavailable && !pending.length && !missing.length, detail: reason, date: pending.length ? pending[0].date : missing[0] || state.to, field: pending.length ? pending[0].field : field || '' });
    }
    add('master', 'Pitstop Master', [], state.cloudLoading ? 'Loading' : state.cloudError || (!state.data.pitstopMaster.length ? 'No Master records' : ''), state.data.pitstopMaster.length + ' records');
    var salesDates = new Set(emailGrafanaSalesRows().map(function(row) { return row.date; }));
    add('emailSales', 'Daily sales', dates.filter(function(date) { return !salesDates.has(date); }), state.emailSalesLoading ? 'Loading' : state.emailSalesError || (HOSTED_MODE && state.emailSalesSyncRange !== selectedRangeKey() ? 'Selected range not loaded' : ''), formatSummaryDate(state.from) + ' - ' + formatSummaryDate(state.to));
    var audit = state.pitstopReconciliation[summaryNetworkRangeKey(windowRange)];
    add('pitstop', 'HQ / BP mapping', [], state.summaryNetworkLoading || state.weekendSalesLoading ? 'Loading' : state.summaryNetworkError || state.weekendSalesError || (!summaryNetworkDataReady(windowRange) ? 'Selected range not loaded' : audit && audit.excluded.length ? audit.excluded.length + ' unmatched location(s)' : ''), formatSummaryDate(windowRange.from) + ' - ' + formatSummaryDate(windowRange.to));
    var rows = rowsInRange();
    ['rsa', 'b2w'].forEach(function(kind) {
      var fields = kind === 'rsa' ? ['rsaJumpstart', 'rsaTyrePatch', 'rsaFuel'] : ['b2w'];
      var missing = rows.filter(function(row) { return fields.some(function(field) { return !Number.isFinite(row[field]); }); });
      var field = missing.length ? fields.find(function(field) { return !Number.isFinite(missing[0][field]); }) : '';
      add(kind, kind.toUpperCase(), missing.map(function(row) { return row.date; }), !state.manualSourcesReady[kind] || state[kind + 'Loading'] ? 'Loading saved values' : state[kind + 'Error'], dates.length + ' day(s) saved', field === 'b2w' ? '' : field);
    });
    ['resq', 'warranty'].forEach(function(kind) {
      add(kind, kind === 'resq' ? 'ResQ' : 'Warranty', [], state[kind + 'Loading'] ? 'Loading' : state[kind + 'Error'] || (HOSTED_MODE && (!state[kind + 'ApiAvailable'] || state[kind + 'SyncRange'] !== selectedRangeKey()) ? 'Selected range not loaded' : ''), dates.length + ' day(s) loaded');
    });
    ['bgarage', 'indonesia'].forEach(function(kind) {
      add(kind, kind === 'bgarage' ? 'BGarage' : 'Indonesia', manualReportHasSavedDate(kind, state.to) || !HOSTED_MODE && (kind === 'bgarage' ? bgarageRowsForWindow(state.to, state.to) : indonesiaRowsForWindow(state.to, state.to)).length ? [] : [state.to], !state.manualSourcesReady[kind] ? 'Loading saved values' : state[kind + 'ValuesError'] || (state[kind + 'SummarySaving'] ? 'Saving' : ''), formatSummaryDate(state.to) + ' saved');
    });
    entries.forEach(function(entry) {
      var key = entry.kind === 'master' ? 'workbook' : ['rsa', 'b2w', 'bgarage', 'indonesia'].indexOf(entry.kind) !== -1 ? entry.kind + 'Manual' : entry.kind;
      if (state.sourceFallbacks[key]) { entry.ready = false; entry.detail = 'Cached fallback; live refresh required'; }
    });
    return entries;
  }

  function reportReadinessMarkup() {
    if (state.view !== 'special') return '';
    var entries = reportReadiness(), ready = entries.filter(function(entry) { return entry.ready; }).length;
    var reason = summaryCopyBlockReason(true), canFinalise = HOSTED_MODE && ready === entries.length && !reason && !archiveState.busy;
    return '<section class="report-readiness" data-copy-exclude aria-label="Daily report readiness"><div class="report-readiness-heading"><div><h3>Report readiness</h3><span>' + ready + ' of ' + entries.length + ' ready for ' + escapeHtml(formatSummaryDate(state.to)) + '</span></div><div class="report-workflow-actions"><button class="header-button" data-workflow-action="versions"' + (!HOSTED_MODE ? ' disabled title="Available on the hosted dashboard"' : '') + '>Report versions</button><button class="header-button email-copy-button" data-workflow-action="finalise"' + (!canFinalise ? ' disabled' : '') + ' title="' + escapeHtml(reason || (canFinalise ? 'Review and finalise this report' : 'Complete the readiness checks first')) + '">Finalise report</button></div></div><div class="report-readiness-list">' + entries.map(function(entry, index) { return '<div class="report-readiness-row ' + (entry.ready ? 'is-ready' : 'needs-review') + '"><span class="readiness-indicator" aria-hidden="true">' + (entry.ready ? '&#10003;' : '!') + '</span><strong>' + escapeHtml(entry.label) + '</strong><span>' + escapeHtml(entry.detail) + '</span><button class="readiness-review" data-workflow-action="issue" data-issue-index="' + index + '">Review</button></div>'; }).join('') + '</div></section>';
  }

  function updateWorkflowControls() {
    var drafts = document.getElementById('draftRecoveryRoot');
    if (drafts) drafts.innerHTML = draftRecoveryMarkup();
    var readiness = document.getElementById('reportReadinessRoot');
    if (readiness) readiness.innerHTML = reportReadinessMarkup();
  }

  function reportVersionSnapshot() {
    var dates = grafanaDateRange(state.from, state.to), monthDates = grafanaDateRange(state.to.slice(0, 8) + '01', state.to);
    function selected(values, selectedDates) { return Object.fromEntries(selectedDates.map(function(date) { return [date, values[date] === undefined ? null : values[date]]; })); }
    var networkWindow = b2cStateSummaryWindow(), networkMap = summaryNetworkSalesMapForWindow(networkWindow);
    return JSON.parse(JSON.stringify({
      from: state.from, to: state.to, capturedAt: new Date().toISOString(), buildId: window.__DASHBOARD_BUILD_ID__ || 'local',
      filters: { reportPreset: state.range, network: networkWindow, weeklyRanking: weeklyRankingWindow(), weeklyTables: !state.emailRankingCollapsed, hideWarehouse: state.emailWarehouseHidden, weekendAverage: state.weekendAverageActive },
      rules: { tierDailyTargets: [12, 9, 7], greenAt: 1, yellowAt: 0.9, yellowShortfallUnits: 1, mapping: REPORT_MAPPING_REGISTRY },
      master: { fingerprint: state.masterFingerprint, uploadedAt: state.cloudUpdatedAt, source: state.sourceName, rows: (state.data.pitstopMaster || []).map(function(row) { return Object.fromEntries(['name', 'channel', 'state', 'region', 'tier', 'active', 'closed', 'malaysia', 'order'].filter(function(key) { return row[key] !== undefined; }).map(function(key) { return [key, row[key]]; })); }), relocations: state.data.pitstopRelocations || [] },
      sources: summarySourceHealthEntries('special'),
      manual: { rsa: selected(state.manualRsaValues, dates), b2w: selected(state.manualB2wValues, dates), bgarage: selected(state.manualBGarageSummaryValues, [state.to]), indonesia: selected(state.manualIndonesiaSummaryValues, monthDates) },
      figures: { sales: emailGrafanaSalesRows(), services: rowsInRange(), network: emailPitstopNetworks(networkWindow.to, { periodFrom: networkWindow.from, periodTo: networkWindow.to, salesMap: networkMap }), weeklyRankingNetwork: state.weeklyRankingPreset === 'previous-week' ? emailPitstopNetworks(weeklyRankingWindow().to, { periodFrom: weeklyRankingWindow().from, periodTo: weeklyRankingWindow().to, salesMap: weeklyRankingSalesMapForWindow(weeklyRankingWindow()) || {} }) : null, weekendSales: state.weekendAverageActive ? state.weekendSalesRows : [], weekendPitstops: state.weekendAverageActive ? state.weekendPitstopSalesByKey : null, bgarage: emailLatestBGarageSnapshot(state.to), indonesia: indonesiaRowsForWindow(monthDates[0], state.to) }
    }));
  }

  async function reportArchiveFetch(query, body) {
    var response = await fetch('/api/report-versions?' + query, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    var value = await response.json().catch(function() { return {}; });
    if (!response.ok) { var error = new Error(value.error || 'Report archive HTTP ' + response.status); error.status = response.status; throw error; }
    return value;
  }

  function renderReportArchive() {
    var root = document.getElementById('reportArchiveContent');
    if (!root) return;
    var pending = archiveState.pending, selected = pending || archiveState.selected;
    root.innerHTML = '<div class="report-archive-controls"><label>Reporting date<input type="date" id="reportArchiveDate" value="' + escapeHtml(archiveState.date) + '"' + (pending || archiveState.busy ? ' disabled' : '') + '></label><span>' + (pending ? 'Review new version ' + (archiveState.latest + 1) : archiveState.latest + ' finalised version(s)') + '</span></div>' +
      '<p class="report-archive-status" role="status">' + escapeHtml(archiveState.error || (archiveState.busy ? 'Loading...' : pending ? 'This saves a read-only report version. It does not send an email or lock live data entry.' : selected ? 'Read-only snapshot. Live data changes do not change this version.' : 'Select a version to preview.')) + '</p>' +
      (!pending ? '<div class="report-version-list">' + archiveState.versions.map(function(version) { return '<button type="button" class="report-version-item' + (selected && selected.version === version.version ? ' is-selected' : '') + '" data-report-version="' + version.version + '"' + (archiveState.busy ? ' disabled' : '') + '><strong>Version ' + version.version + '</strong><span>' + escapeHtml(formatSourceTimestamp(version.finalisedAt)) + '</span><span>' + escapeHtml(formatSummaryDate(version.from) + ' - ' + formatSummaryDate(version.date)) + '</span><span>' + escapeHtml(version.note || 'Initial report') + '</span></button>'; }).join('') + (!archiveState.versions.length && !archiveState.busy ? '<p>No finalised reports for this date.</p>' : '') + (archiveState.before ? '<button class="header-button" id="reportArchiveOlder"' + (archiveState.busy ? ' disabled' : '') + '>Older versions</button>' : '') + '</div>' : '<label class="report-version-note">' + (archiveState.latest ? 'Reason for revision' : 'Report note (optional)') + '<textarea id="reportVersionNote" maxlength="500" rows="2"' + (archiveState.busy ? ' disabled' : '') + '>' + escapeHtml(pending.note || '') + '</textarea></label>') +
      (selected ? '<div class="report-version-meta">' + escapeHtml('Report: ' + formatSummaryDate(selected.snapshot.from) + ' - ' + formatSummaryDate(selected.snapshot.to) + ' | HQ/BP: ' + formatSummaryDate(selected.snapshot.filters.network.from) + ' - ' + formatSummaryDate(selected.snapshot.filters.network.to)) + '</div><iframe class="report-version-preview" id="reportVersionPreview" title="Finalised report preview" sandbox="" referrerpolicy="no-referrer"></iframe><div class="report-archive-actions">' + (pending ? '<button class="header-button email-copy-button" id="reportArchiveConfirm"' + (archiveState.busy ? ' disabled' : '') + '>' + (archiveState.busy ? 'Finalising...' : 'Finalise version ' + (archiveState.latest + 1)) + '</button>' : '<button class="header-button email-copy-button" id="reportArchiveCopy">Copy this version</button><button class="header-button" id="reportArchiveDownload">Download HTML</button>') + '</div>' : '');
    var frame = document.getElementById('reportVersionPreview');
    if (frame && selected) frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"></head><body style="margin:16px">' + selected.html + '</body></html>';
    var dateInput = document.getElementById('reportArchiveDate');
    dateInput.addEventListener('change', function() { if (validWorkflowDate(dateInput.value)) loadReportVersions(dateInput.value); });
    root.querySelectorAll('[data-report-version]').forEach(function(button) { button.addEventListener('click', function() { loadReportVersion(Number(button.getAttribute('data-report-version'))); }); });
    var older = document.getElementById('reportArchiveOlder');
    if (older) older.addEventListener('click', function() { loadReportVersions(archiveState.date, true); });
    var note = document.getElementById('reportVersionNote');
    if (note) {
      note.disabled = archiveState.busy || !!pending.submitted;
      note.addEventListener('input', function() { if (archiveState.pending && !archiveState.pending.submitted) archiveState.pending.note = note.value; });
    }
    var confirm = document.getElementById('reportArchiveConfirm');
    if (confirm) confirm.addEventListener('click', finaliseReportVersion);
    var copy = document.getElementById('reportArchiveCopy');
    if (copy) copy.addEventListener('click', async function() {
      try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([selected.html], { type: 'text/html' }), 'text/plain': new Blob([selected.text], { type: 'text/plain' }) })]); showToast('Finalised version ' + selected.version + ' copied.'); }
      catch (_) { showToast('Clipboard access was blocked. Allow access and try again.'); }
    });
    var download = document.getElementById('reportArchiveDownload');
    if (download) download.addEventListener('click', function() {
      var link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob(['<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Finalised report</title></head><body>' + selected.html + '</body></html>'], { type: 'text/html' }));
      link.download = 'Daily-report-' + selected.date + '-v' + selected.version + '.html'; link.click(); window.setTimeout(function() { URL.revokeObjectURL(link.href); }, 1000);
    });
  }

  async function loadReportVersions(date, append) {
    var request = ++archiveState.request;
    archiveState.date = date; archiveState.busy = true; archiveState.error = ''; archiveState.pending = null; archiveState.selected = null;
    if (!append) { archiveState.latest = 0; archiveState.versions = []; archiveState.before = null; }
    renderReportArchive();
    try {
      var result = await reportArchiveFetch('date=' + encodeURIComponent(date) + (append && archiveState.before ? '&before=' + archiveState.before : ''));
      if (request !== archiveState.request) return;
      archiveState.latest = result.latest; archiveState.versions = (append ? archiveState.versions : []).concat(result.versions); archiveState.before = result.before;
    } catch (error) { if (request === archiveState.request) archiveState.error = error.message; }
    finally { if (request === archiveState.request) { archiveState.busy = false; renderReportArchive(); updateWorkflowControls(); } }
  }

  async function loadReportVersion(version) {
    var request = ++archiveState.request;
    archiveState.busy = true; archiveState.error = ''; renderReportArchive();
    try { var report = await reportArchiveFetch('date=' + archiveState.date + '&version=' + version); if (request === archiveState.request) archiveState.selected = report; }
    catch (error) { if (request === archiveState.request) archiveState.error = error.message; }
    finally { if (request === archiveState.request) { archiveState.busy = false; renderReportArchive(); } }
  }

  async function prepareReportVersion() {
    if (state.view !== 'special' || !HOSTED_MODE || archiveState.busy) return;
    var reason = summaryCopyBlockReason(false);
    if (reason || reportReadiness().some(function(entry) { return !entry.ready; })) { showToast(reason || 'Complete the readiness checklist first.'); return; }
    var revision = state.summaryRenderRevision, snapshot = reportVersionSnapshot(), content = await copyEmailSummary({ snapshotOnly: true });
    if (!content || revision !== state.summaryRenderRevision) { showToast('The report changed. Review it and try again.'); return; }
    var dialog = document.getElementById('reportArchiveDialog');
    archiveState.pending = Object.assign(content, { snapshot: snapshot, note: '', renderRevision: revision, requestId: crypto.randomUUID() });
    archiveState.date = snapshot.to; archiveState.error = ''; archiveState.busy = true; archiveState.selected = null;
    archiveState.latest = 0; archiveState.versions = []; archiveState.before = null;
    dialog.showModal(); renderReportArchive(); updateWorkflowControls();
    try { var result = await reportArchiveFetch('date=' + snapshot.to); archiveState.latest = result.latest; }
    catch (error) { archiveState.error = error.message; archiveState.pending = null; }
    finally { archiveState.busy = false; renderReportArchive(); updateWorkflowControls(); }
  }

  async function finaliseReportVersion() {
    var pending = archiveState.pending;
    if (!pending || archiveState.busy) return;
    if (pending.renderRevision !== state.summaryRenderRevision || summaryCopyBlockReason(false)) { archiveState.error = 'Live report changed after preview. Close this review and finalise again.'; renderReportArchive(); return; }
    if (archiveState.latest && !pending.note.trim()) { archiveState.error = 'Enter a reason for this revised version.'; renderReportArchive(); return; }
    archiveState.busy = true; archiveState.error = ''; renderReportArchive(); updateWorkflowControls();
    try {
      pending.submitted = pending.submitted || { requestId: pending.requestId, expectedLatest: archiveState.latest, html: pending.html, text: pending.text, snapshot: pending.snapshot, note: pending.note };
      var result = await reportArchiveFetch('date=' + archiveState.date, pending.submitted);
      archiveState.latest = result.report.version; archiveState.pending = null;
      archiveState.versions = [result.report]; archiveState.before = result.report.version > 1 ? result.report.version : null;
      showToast('Report finalised as version ' + result.report.version + '. No email was sent.');
      archiveState.selected = await reportArchiveFetch('date=' + archiveState.date + '&version=' + result.report.version);
    } catch (error) {
      archiveState.error = error.message;
      if (error.status === 409) archiveState.pending = null;
      else if (error.status && error.status < 500) pending.submitted = null;
      else if (archiveState.pending) archiveState.error += ' Retry will use this same snapshot.';
    }
    finally { archiveState.busy = false; renderReportArchive(); updateWorkflowControls(); }
  }

  function bindReportWorkflow() {
    var dialog = document.getElementById('reportArchiveDialog');
    document.getElementById('reportArchiveClose').addEventListener('click', function() { if (!archiveState.busy) dialog.close(); });
    dialog.addEventListener('cancel', function(event) { if (archiveState.busy) event.preventDefault(); });
    document.addEventListener('click', async function(event) {
      var button = event.target.closest('[data-workflow-action]');
      if (!button || button.disabled) return;
      var action = button.getAttribute('data-workflow-action');
      if (action === 'recover') return recoverSummaryDrafts();
      if (action === 'review-drafts') { draftReviewOpen = !draftReviewOpen; updateWorkflowControls(); return; }
      if (action === 'review-draft') return openWorkflowIssue(state.summaryDrafts[button.getAttribute('data-draft-key')]);
      if (action === 'issue') return openWorkflowIssue(reportReadiness()[Number(button.getAttribute('data-issue-index'))]);
      if (action === 'finalise') return prepareReportVersion();
      if (action === 'versions') { dialog.showModal(); return loadReportVersions(state.to); }
      if (action === 'discard-recovery' || action === 'discard-drafts' || action === 'discard-draft') {
        if (!await confirmSummaryOverwrite({ title: 'Discard unsaved edits?', confirmLabel: 'Discard edits', message: 'Only the selected browser drafts will be removed. Saved report values will not change.' })) return;
        if (action === 'discard-recovery') removeRecoverySources();
        else { if (action === 'discard-draft') delete state.summaryDrafts[button.getAttribute('data-draft-key')]; else state.summaryDrafts = {}; syncSummaryDirty(); persistSummaryDrafts(); }
        render();
      }
    });
    window.addEventListener('pagehide', persistSummaryDrafts);
  }

  function captureSummaryCopySnapshot() {
    state.summaryCopySnapshot = null;
    var source = document.getElementById('emailSummaryContent');
    if (!source || !isSummaryView() || summaryCopyBlockReason(true)) {
      updateSummaryCopyButtons();
      return;
    }
    var rect = source.getBoundingClientRect();
    state.summaryCopySnapshot = {
      view: state.view,
      revision: state.summaryRenderRevision,
      html: source.outerHTML,
      width: Math.max(320, Math.round(rect.width || source.scrollWidth || 920)),
      parentClass: source.parentElement ? source.parentElement.className : 'email-summary-view',
      capturedAt: new Date().toISOString()
    };
    updateSummaryCopyButtons();
  }

  function createSummarySnapshotHost() {
    var snapshot = state.summaryCopySnapshot;
    if (!snapshot || snapshot.view !== state.view || snapshot.revision !== state.summaryRenderRevision) return null;
    var host = document.createElement('section');
    host.className = snapshot.parentClass || 'email-summary-view';
    host.setAttribute('aria-hidden', 'true');
    host.style.position = 'fixed';
    host.style.left = '-100000px';
    host.style.top = '0';
    host.style.width = snapshot.width + 'px';
    host.style.visibility = 'hidden';
    host.style.pointerEvents = 'none';
    host.innerHTML = snapshot.html;
    document.body.appendChild(host);
    return host;
  }

  function formatSourceTimestamp(value) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace(',', '');
  }

  function summaryHealthEntry(key, label, loading, error, available, detail, updatedAt, manual) {
    var fallback = state.sourceFallbacks[key], status = loading ? 'loading' : fallback ? 'fallback' : error ? 'error' : available ? (manual ? 'manual' : 'live') : 'waiting';
    var statusText = status === 'live' ? 'Live' : status === 'manual' ? 'Saved input' : status === 'fallback' ? 'Last success' : status === 'loading' ? 'Loading' : status === 'error' ? 'Unavailable' : 'Waiting';
    return { key: key, label: label, status: status, statusText: statusText, detail: detail || '', updatedAt: fallback && (fallback.generatedAt || fallback.savedAt) || updatedAt || state.sourceLastSuccess[key] || '' };
  }

  function summarySourceHealthEntries(view) {
    var entries = [summaryHealthEntry('workbook', 'Workbook', state.cloudLoading, state.cloudError, !!state.data, state.sourceName || 'Pitstop Master', state.cloudUpdatedAt || state.data && state.data.loadedAt, false)];
    if (view === 'special' || view === 'summary-header') entries.push(summaryHealthEntry('emailSales', 'Sales', state.emailSalesLoading, state.emailSalesError, !!emailGrafanaSalesRows().length, state.grafanaEmailSalesSource || 'Grafana Order - Daily', state.grafanaEmailSalesGeneratedAt, false));
    if (view === 'special') entries.push(summaryHealthEntry('pitstop', 'Pitstops', state.summaryNetworkLoading || state.weekendSalesLoading, state.summaryNetworkError || state.grafanaPitstopError, summaryNetworkDataReady(b2cStateSummaryWindow()), state.grafanaPitstopSource || 'Grafana HQ/BP performance', state.grafanaPitstopLastSync, false));
    if (view === 'special' || view === 'operations-summary') {
      entries.push(summaryHealthEntry('rsaManual', 'RSA', state.rsaLoading, state.rsaError, state.manualSourcesReady.rsa, 'Manual saved values', state.rsaValuesUpdatedAt, true));
      var b2wSharePoint = /sharepoint/i.test(state.b2wSource || '');
      entries.push(summaryHealthEntry('b2wManual', 'B2W', state.b2wLoading || state.b2wSyncing, state.b2wError, state.manualSourcesReady.b2w, state.b2wSource || 'Manual saved values', state.b2wSharePointSyncedAt || state.b2wUpdatedAt, !b2wSharePoint));
      entries.push(summaryHealthEntry('resq', 'ResQ', state.resqLoading, state.resqError, state.resqApiAvailable, state.grafanaResqSource || 'Grafana ResQ', state.grafanaResqGeneratedAt, false));
      entries.push(summaryHealthEntry('warranty', 'Warranty', state.warrantyLoading, state.warrantyError, state.warrantyApiAvailable, state.grafanaWarrantySource || 'Grafana Warranty', state.grafanaWarrantyGeneratedAt, false));
    }
    if (view === 'special' || view === 'bgarage-summary') entries.push(summaryHealthEntry('bgarageManual', 'BGarage', state.bgarageSummarySaving, state.bgarageValuesError, state.manualSourcesReady.bgarage, 'Saved dashboard input', state.bgarageValuesUpdatedAt, true));
    if (view === 'special' || view === 'indonesia-summary') entries.push(summaryHealthEntry('indonesiaManual', 'Indonesia', state.indonesiaSummarySaving, state.indonesiaValuesError, state.manualSourcesReady.indonesia, 'Saved dashboard input', state.indonesiaValuesUpdatedAt, true));
    return entries;
  }

  function summarySourceHealthMarkup(view, reportDate) {
    var entries = summarySourceHealthEntries(view), latest = entries.map(function(entry) { return new Date(entry.updatedAt).getTime(); }).filter(Number.isFinite).sort(function(a, b) { return b - a; })[0];
    var items = entries.map(function(entry) {
      var title = entry.detail + (entry.updatedAt ? ' · ' + formatSourceTimestamp(entry.updatedAt) : '');
      return '<span class="summary-health-item is-' + entry.status + '" title="' + escapeHtml(title) + '"><i aria-hidden="true"></i><strong>' + escapeHtml(entry.label) + '</strong><span>' + escapeHtml(entry.statusText) + '</span></span>';
    }).join('');
    return '<div class="summary-source-health" data-copy-exclude aria-label="Report source health"><div class="summary-source-health-main"><div class="summary-source-health-meta"><strong>Report ' + escapeHtml(formatSummaryDate(reportDate || state.to || lastDate())) + '</strong><span>' + (latest ? 'Latest source update ' + escapeHtml(formatSourceTimestamp(latest)) : 'Waiting for source timestamps') + '</span></div><div class="summary-source-health-items">' + items + '</div></div><button type="button" class="header-button summary-refresh-button" data-refresh-summary' + (state.cloudLoading ? ' disabled' : '') + '>' + (state.cloudLoading ? 'Refreshing...' : 'Refresh data') + '</button></div>';
  }

  function manualB2wEditorCell(date) {
    var value = hasManualB2w(date) ? String(manualB2wValue(date)) : '';
    return '<td class="email-b2w-cell"><input class="email-b2w-input" type="number" min="0" max="1000000" step="1" inputmode="numeric" data-b2w-input data-b2w-date="' + escapeHtml(date) + '" value="' + escapeHtml(value) + '" placeholder="" aria-label="B2W pieces for ' + escapeHtml(formatDate(date, true)) + '" title="Enter B2W pieces for this date"></td>';
  }

  function manualRsaEditorCell(date, field, label) {
    var value = hasManualRsa(date, field) ? String(manualRsaValue(date, field)) : '';
    return '<td class="email-b2w-cell"><input class="email-b2w-input" type="number" min="0" max="1000000" step="1" inputmode="numeric" data-rsa-input data-rsa-date="' + escapeHtml(date) + '" data-rsa-field="' + escapeHtml(field) + '" value="' + escapeHtml(value) + '" placeholder="" aria-label="' + escapeHtml(label) + ' units for ' + escapeHtml(formatDate(date, true)) + '" title="Enter ' + escapeHtml(label) + ' units for this date"></td>';
  }

  function manualServiceSaveHeading() {
    return '<div class="email-editable-heading"><p class="email-section-lead">For <strong>RSA and B2W</strong> as of yesterday, please refer to the breakdowns below:</p><span class="email-service-actions"><button class="email-service-save" type="button" data-sync-b2w data-copy-exclude ' + (state.b2wSyncing ? 'disabled' : '') + '>' + (state.b2wSyncing ? 'Syncing...' : 'Sync B2W from SharePoint') + '</button><button class="email-service-save" type="button" data-save-service-values data-copy-exclude ' + (state.manualServiceSaving ? 'disabled' : '') + '>' + (state.manualServiceSaving ? 'Saving...' : 'Save RSA &amp; B2W') + '</button></span></div>';
  }

  function operationsTableWidths(key) {
    return (OPERATIONS_TABLE_COLUMN_WIDTHS[key] || OPERATIONS_TABLE_COLUMN_WIDTHS.rsa).slice();
  }

  function operationsTableTotalWidth(key) {
    return operationsTableWidths(key).reduce(function(total, width) { return total + width; }, 0);
  }

  function operationsTableStart(key, className) {
    var columns = operationsTableWidths(key).map(function(width) { return '<col style="width:' + width + 'px" width="' + width + '">'; }).join('');
    return '<table class="email-table operations-fit-table ' + className + '" data-operations-table="' + key + '" style="--operations-table-width:' + operationsTableTotalWidth(key) + 'px"><colgroup>' + columns + '</colgroup>';
  }

  function renderEmailSummary() {
    var normalSalesRows = emailGrafanaSalesRows(), reportDate = state.to || (normalSalesRows.length ? normalSalesRows[normalSalesRows.length - 1].date : lastDate()), salesRows = normalSalesRows, latest = salesRows[salesRows.length - 1], boundaryPrior = salesRows.length > 1 ? salesRows[salesRows.length - 2] : priorEmailSalesRow();
    var movingRows = salesRows.slice(-3), movingAverage = HOSTED_MODE && latest && Number.isFinite(numberValue(latest.movingAverageAll)) ? numberValue(latest.movingAverageAll) : movingRows.length ? Math.round(movingRows.reduce(function(sum, row) { return sum + totalSales(row); }, 0) / movingRows.length) : 0;
    var serviceRows = rowsInRange();
    var normalNetworks = emailPitstopNetworks(reportDate, { weekendAverage: false });
    var b2cStateWindow = b2cStateSummaryWindow(), summaryNetworkOptions = { periodFrom: b2cStateWindow.from, periodTo: b2cStateWindow.to }, summarySalesMap = summaryNetworkSalesMapForWindow(b2cStateWindow);
    if (summarySalesMap) summaryNetworkOptions.salesMap = summarySalesMap;
    var summaryNetworks = b2cStateWindow.preset === 'report' ? normalNetworks : emailPitstopNetworks(b2cStateWindow.to || reportDate, summaryNetworkOptions);
    var weeklyWindow = weeklyRankingWindow(), weeklySalesMap = weeklyRankingSalesMapForWindow(weeklyWindow), weeklyNetworkOptions = { periodFrom: weeklyWindow.from, periodTo: weeklyWindow.to };
    if (weeklySalesMap) weeklyNetworkOptions.salesMap = weeklySalesMap;
    var weeklyNetworks = state.weeklyRankingPreset === 'previous-week'
      ? weeklySalesMap ? emailPitstopNetworks(weeklyWindow.to || reportDate, weeklyNetworkOptions) : { b2c: [], bp: [] }
      : summaryNetworks;
    var weeklyEmptyMessage = state.weeklyRankingLoading ? 'Loading previous-week sales from Grafana...' : state.weeklyRankingError || 'No pitstop data is available.';
    // This local shortcut controls only the eight B2C/B2B2C performance
    // tables. Every table below receives the same filtered network snapshot;
    // sales, operations, BGarage, and Indonesia continue using state.from/to.
    var achievementNetworks = state.weekendAverageActive && b2cStateWindow.preset === 'report' ? emailPitstopNetworks(reportDate, { weekendAverage: true }) : summaryNetworks;
    var hqRows = emailVisibleB2cRows(summaryNetworks.b2c), bpRows = summaryNetworks.bp, achievementHqRows = emailVisibleB2cRows(achievementNetworks.b2c), achievementBpRows = achievementNetworks.bp, weeklyHqRows = emailVisibleB2cRows(weeklyNetworks.b2c);
    var salesBody = salesRows.map(function(row, index) { var prior = index > 0 ? salesRows[index - 1] : boundaryPrior, movement = row.movement || (prior ? totalSales(row) >= totalSales(prior) ? 'Increase' : 'Decrease' : 'First day'), dateLabel = formatSummaryDate(row.date); return '<tr><td>' + escapeHtml(dateLabel) + '</td><td>' + formatNumber(row.b2c) + '</td><td>' + formatNumber(row.b2b2c) + '</td><td>' + formatNumber(totalSales(row)) + '</td><td class="email-movement ' + (movement === 'Decrease' ? 'decrease' : '') + '">' + movement + '</td></tr>'; }).join('');
    var rsaBody = serviceRows.map(function(row) { var total = row.rsaJumpstart + row.rsaTyrePatch + row.rsaFuel; return '<tr><td>' + escapeHtml(formatSummaryDate(row.date)) + '</td>' + manualRsaEditorCell(row.date, 'rsaJumpstart', 'RSA Jumpstart') + manualRsaEditorCell(row.date, 'rsaTyrePatch', 'RSA Tyre Patch') + manualRsaEditorCell(row.date, 'rsaFuel', 'RSA Fuel') + '<td><strong>' + formatNumber(total) + '</strong></td>' + manualB2wEditorCell(row.date) + '</tr>'; }).join('');
    var resqBody = serviceRows.map(function(row) { var total = row.resQSelangor + row.resQJb + row.resQPahang + row.resQPenang; return '<tr><td>' + escapeHtml(formatSummaryDate(row.date)) + '</td><td>' + formatNumber(row.resQSelangor) + '</td><td>' + formatNumber(row.resQJb) + '</td><td>' + formatNumber(row.resQPahang) + '</td><td>' + formatNumber(row.resQPenang) + '</td><td><strong>' + formatNumber(total) + '</strong></td></tr>'; }).join('');
    var warrantyBody = serviceRows.map(function(row) { return '<tr><td>' + escapeHtml(formatSummaryDate(row.date)) + '</td><td>' + formatNumber(row.warranty1st) + '</td><td>' + formatNumber(row.warranty2nd) + '</td><td>' + formatNumber(row.warranty3rd) + '</td></tr>'; }).join('');
    var indonesiaLatestDate = reportDate, indonesiaLatest = indonesiaRowsForWindow(reportDate, reportDate), indonesiaMonth = indonesiaGroupedRows(indonesiaRowsForWindow(reportDate.slice(0, 8) + '01', reportDate));
    var bgarageRows = emailLatestBGarageSnapshot(reportDate), sumBg = function(key) { return bgarageRows.reduce(function(sum, row) { return sum + numberValue(row[key]); }, 0); }, bgTarget = sumBg('dailyTarget'), bgActual = sumBg('dailyActual'), bgMtd = sumBg('mtdActual'), bgMonthly = sumBg('monthlyTarget'), bgReferrals = sumBg('referrals'), bgConversions = sumBg('conversions'), bgPickDrop = sumBg('pickDrop'), bgIntake = sumBg('intakeActual'), bgIntakeTarget = sumBg('intakeTarget');
    var bgSalesRows = bgarageRows.map(function(row) { var status = performanceStatus(row.dailyAchievement, row.dailyTarget, state.data.thresholds); return '<tr><td>' + escapeHtml(row.outlet) + '</td><td>' + formatBGarageMoney(row.dailyTarget) + '</td><td>' + formatBGarageMoney(row.dailyActual) + '</td><td>' + formatAchievement(row.dailyAchievement) + '</td><td class="email-performance ' + status + '">' + performanceLabel(status) + '</td><td>' + formatAchievement(row.mtdAchievement) + '</td><td>' + formatBGarageMoney(row.mtdActual) + '</td><td>' + formatBGarageMoney(row.monthlyTarget) + '</td><td>' + formatBGarageMoney(row.shortfall) + '</td></tr>'; }).join('');
    var bgLeadRows = bgarageRows.map(function(row) { var conversion = row.referrals ? Math.round(row.conversions / row.referrals * 100) : 0, status = performanceStatus(row.intakeAchievement, row.intakeTarget, state.data.thresholds); return '<tr><td>' + escapeHtml(row.outlet) + '</td><td>' + formatNumber(row.referrals) + '</td><td>' + formatNumber(row.conversions) + '</td><td>' + conversion + '%</td><td>' + formatNumber(row.pickDrop) + '</td><td>' + formatNumber(row.intakeActual) + '</td><td>' + formatNumber(row.intakeTarget) + '</td><td>' + formatAchievement(row.intakeAchievement) + '</td><td class="email-performance ' + status + '">' + performanceLabel(status) + '</td></tr>'; }).join('');
    var bgAchievement = bgTarget ? Math.round(bgActual / bgTarget * 100) : null, bgStatus = performanceStatus(bgAchievement, bgTarget, state.data.thresholds), bgMtdAchievement = bgMonthly ? Math.round(bgMtd / bgMonthly * 100) : null, bgIntakeAchievement = bgIntakeTarget ? Math.round(bgIntake / bgIntakeTarget * 100) : 0, bgIntakeStatus = performanceStatus(bgIntakeAchievement, bgIntakeTarget, state.data.thresholds);
    var salesEmptyMessage = state.emailSalesLoading ? 'Loading Order - Daily data from Grafana...' : state.emailSalesError ? escapeHtml(state.emailSalesError) : 'No sales data is available.';
    var content = '<div class="email-summary-document" id="emailSummaryContent"><p class="email-summary-greeting">Dear all,</p><p class="email-summary-intro">This is the sales report for our <strong>B2C and B2B2C</strong> channels as of <strong>' + escapeHtml(emailOrdinalDate(reportDate)) + '</strong>. The moving average for our total sales as of yesterday was <strong>' + formatNumber(movingAverage) + ' units</strong>. Please refer to the details below:</p>' +
      '<table class="email-table email-sales-table"><thead><tr><th>Date</th><th>B2C<br>(Units)</th><th>B2B2C<br>(Units)</th><th>Total (Units)</th><th>Movement</th></tr></thead><tbody>' + (salesBody || '<tr><td colspan="5">' + salesEmptyMessage + '</td></tr>') + '</tbody></table>' +
      '<p class="email-major-lead"><strong>Please take a look at the details below on pitstops that achieved their targets by tier as of yesterday.</strong></p><table class="email-legend" role="presentation" cellpadding="0" cellspacing="0" border="0"><tbody><tr><td>' + emailStatusDot('green') + '</td><td>Green &ndash; Target met or exceeded</td></tr><tr><td>' + emailStatusDot('yellow') + '</td><td>Yellow &ndash; Within 10% or 1 unit short</td></tr><tr><td>' + emailStatusDot('red') + '</td><td>Red &ndash; More than 10% and 1 unit short</td></tr></tbody></table>' +
      emailStateSummary(hqRows, 'B2C', { localFilter: true }) + emailWeeklyTopBottom(weeklyHqRows, 'Pitstop', { showFilter: true, emptyMessage: weeklyEmptyMessage }) + emailTierSummary(achievementHqRows, 'B2C') + emailPitstopDetails(achievementHqRows, 'B2C') + emailStateSummary(bpRows, 'BP') + emailWeeklyTopBottom(weeklyNetworks.bp, 'BP', { emptyMessage: weeklyEmptyMessage }) + emailTierSummary(achievementBpRows, 'BP') + emailPitstopDetails(achievementBpRows, 'B2B2C') +
      manualServiceSaveHeading() + operationsTableStart('rsa', 'operations-rsa-table') + '<thead><tr><th>Date</th><th>RSA - Jumpstart<br>(Units)</th><th>RSA - Tyre Patch<br>(Units)</th><th>RSA - Fuel<br>(Units)</th><th>Total RSA<br>(Units)</th><th>B2W<br>(Pcs)</th></tr></thead><tbody>' + (rsaBody || '<tr><td colspan="6">No RSA or B2W data is available.</td></tr>') + '</tbody></table>' +
      '<p class="email-section-lead">For <strong>ResQ by state</strong>, please refer to the breakdowns below:</p>' + operationsTableStart('resq', 'operations-resq-table') + '<thead><tr><th>Date</th><th>ResQ - HQ Selangor<br>(Units)</th><th>ResQ - Johor Bahru<br>(Units)</th><th>ResQ - Pahang<br>(Units)</th><th>ResQ - Pulau Pinang<br>(Units)</th><th>Total All ResQ<br>(Units)</th></tr></thead><tbody>' + (resqBody || '<tr><td colspan="6">No ResQ data is available.</td></tr>') + '</tbody></table>' +
      '<p class="email-section-lead">As for <strong>warranty</strong> tracking, please refer to the following:</p>' + operationsTableStart('warranty', 'operations-warranty-table') + '<thead><tr><th>Date</th><th>Total number of warranty cases attended</th><th>Number of warranty cases attended (twice)</th><th>Number of warranty cases attended (3x)</th></tr></thead><tbody>' + (warrantyBody || '<tr><td colspan="4">No warranty data is available.</td></tr>') + '</tbody></table>' +
      '<p class="email-major-lead"><strong>Below is BGarage Sales Report &amp; Performance:</strong></p><p>Reporting date: ' + escapeHtml(formatSummaryDate(reportDate)) + '</p><p><strong>Status classification:</strong></p><table class="email-table email-classification"><thead><tr><th>Achievement</th><th>Status</th></tr></thead><tbody><tr><td>&ge;100%</td><td class="email-performance achieved">Achieved</td></tr><tr><td>80%&ndash;99%</td><td class="email-performance near">Near Target</td></tr><tr><td>60%&ndash;79%</td><td class="email-performance below">Below Target</td></tr><tr><td>&lt;60%</td><td class="email-performance critical">Critical</td></tr><tr><td>No target</td><td class="email-performance na">N/A</td></tr></tbody></table>' +
      '<p><strong>A. Sales Performance</strong></p><div class="email-table-scroll"><table class="email-table email-bgarage-table"><thead><tr><th>BGarage Outlet</th><th>Daily Sales Target (RM)</th><th>Daily Actual Sales (RM)</th><th>Daily Achievement (%)</th><th>Sales Status</th><th>MTD Sales Achievement (%)</th><th>MTD Actual Sales (RM)</th><th>Monthly Target</th><th>MTD Sales Shortfall (RM)</th></tr></thead><tbody>' + bgSalesRows + '<tr class="email-total-row"><td><strong>Total BGarage</strong></td><td>' + formatMoney(bgTarget) + '</td><td>' + formatMoney(bgActual) + '</td><td>' + formatAchievement(bgAchievement) + '</td><td class="email-performance ' + bgStatus + '">' + performanceLabel(bgStatus) + '</td><td>' + formatAchievement(bgMtdAchievement) + '</td><td>' + formatMoney(bgMtd) + '</td><td>' + formatMoney(bgMonthly) + '</td><td>' + formatMoney(bgMtd - bgMonthly) + '</td></tr></tbody></table></div>' +
      '<p><strong>B. Conversion &amp; Intake Performance</strong></p><div class="email-table-scroll"><table class="email-table email-bgarage-table"><thead><tr><th>BGarage Outlet</th><th>Special Cases Referred</th><th>Successful Conversions</th><th>Conversion Rate (%)</th><th>Pick &amp; Drop Cases</th><th>Daily Intake Actual</th><th>Daily Intake Target</th><th>Intake Achievement (%)</th><th>Intake Status</th></tr></thead><tbody>' + bgLeadRows + '<tr class="email-total-row"><td><strong>Total BGarage</strong></td><td>' + formatNumber(bgReferrals) + '</td><td>' + formatNumber(bgConversions) + '</td><td>' + (bgReferrals ? Math.round(bgConversions / bgReferrals * 100) : 0) + '%</td><td>' + formatNumber(bgPickDrop) + '</td><td>' + formatNumber(bgIntake) + '</td><td>' + formatNumber(bgIntakeTarget) + '</td><td>' + bgIntakeAchievement + '%</td><td class="email-performance ' + bgIntakeStatus + '">' + performanceLabel(bgIntakeStatus) + '</td></tr></tbody></table></div>' +
      '<p class="email-major-lead"><strong>Below is Bateriku Indonesia Sales Report &amp; Performance:</strong></p><p><strong>BATERIKU INDONESIA &ndash; DAILY SALES REPORT</strong></p><p>Tarikh: ' + escapeHtml(formatSummaryDate(indonesiaLatestDate || reportDate)) + '</p><p><strong>Daily Performance Summary</strong></p><div class="email-table-scroll"><table class="email-table email-indonesia-table">' + emailIndonesiaHeader(true) + '<tbody>' + (indonesiaLatest.map(function(row) { return emailIndonesiaRow(row, true); }).join('') || '<tr><td colspan="13">No Indonesia daily data is available.</td></tr>') + '</tbody></table></div><p><strong>Cumulative Sales ' + escapeHtml(indonesiaLatestDate ? emailOrdinalDate(indonesiaLatestDate).split(' ')[1] : '') + ' Summary</strong></p><div class="email-table-scroll"><table class="email-table email-indonesia-table">' + emailIndonesiaHeader(false) + '<tbody>' + (indonesiaMonth.map(function(row) { return emailIndonesiaRow(row, false); }).join('') || '<tr><td colspan="12">No Indonesia cumulative data is available.</td></tr>') + '</tbody></table></div></div>';
    return '<section class="email-summary-view"><div class="email-summary-toolbar"><div><span class="eyebrow">Email-ready report</span><h2>Daily report summary</h2><p>Copy the complete formatted report and paste it directly into Outlook.</p><small class="summary-source">Sales source: ' + escapeHtml(HOSTED_MODE ? (state.grafanaEmailSalesSource || 'Grafana Order - Daily') : 'Standalone report data') + '</small></div><div class="email-summary-actions"><div class="email-summary-action-stack">' + summaryCopyButton('Copy all summary') + emailWarehouseToggleButton() + '<button class="header-button email-ranking-toggle" type="button" data-email-ranking-toggle aria-expanded="' + (!state.emailRankingCollapsed) + '">' + (state.emailRankingCollapsed ? 'Show weekly tables' : 'Hide weekly tables') + '</button>' + weekendAverageButton() + '</div></div></div>' + summarySourceHealthMarkup('special', reportDate) + weekendAverageStatus(reportDate) + content + '</section>';
  }

  // Email-ready operational section only: services, warranty and BGarage.
  // It deliberately shares the global Summary date controls and
  // source logic, while omitting the sales header and HQ/BP pitstop tables.
  function renderOperationsSummary() {
    var reportDate = state.to || lastDate(), serviceRows = rowsInRange();
    var rsaBody = serviceRows.map(function(row) { var total = row.rsaJumpstart + row.rsaTyrePatch + row.rsaFuel; return '<tr><td>' + escapeHtml(formatSummaryDate(row.date)) + '</td>' + manualRsaEditorCell(row.date, 'rsaJumpstart', 'RSA Jumpstart') + manualRsaEditorCell(row.date, 'rsaTyrePatch', 'RSA Tyre Patch') + manualRsaEditorCell(row.date, 'rsaFuel', 'RSA Fuel') + '<td><strong>' + formatNumber(total) + '</strong></td>' + manualB2wEditorCell(row.date) + '</tr>'; }).join('');
    var resqBody = serviceRows.map(function(row) { var total = row.resQSelangor + row.resQJb + row.resQPahang + row.resQPenang; return '<tr><td>' + escapeHtml(formatSummaryDate(row.date)) + '</td><td>' + formatNumber(row.resQSelangor) + '</td><td>' + formatNumber(row.resQJb) + '</td><td>' + formatNumber(row.resQPahang) + '</td><td>' + formatNumber(row.resQPenang) + '</td><td><strong>' + formatNumber(total) + '</strong></td></tr>'; }).join('');
    var warrantyBody = serviceRows.map(function(row) { return '<tr><td>' + escapeHtml(formatSummaryDate(row.date)) + '</td><td>' + formatNumber(row.warranty1st) + '</td><td>' + formatNumber(row.warranty2nd) + '</td><td>' + formatNumber(row.warranty3rd) + '</td></tr>'; }).join('');
    var content = '<div class="email-summary-document operations-summary-document" id="emailSummaryContent" data-copy-variant="operations-summary">' +
      manualServiceSaveHeading() + operationsTableStart('rsa', 'operations-rsa-table') + '<thead><tr><th>Date</th><th>RSA - Jumpstart<br>(Units)</th><th>RSA - Tyre Patch<br>(Units)</th><th>RSA - Fuel<br>(Units)</th><th>Total RSA<br>(Units)</th><th>B2W<br>(Pcs)</th></tr></thead><tbody>' + (rsaBody || '<tr><td colspan="6">No RSA or B2W data is available.</td></tr>') + '</tbody></table>' +
      '<p class="email-section-lead">For <strong>ResQ by state</strong>, please refer to the breakdowns below:</p>' + operationsTableStart('resq', 'operations-resq-table') + '<thead><tr><th>Date</th><th>ResQ - HQ Selangor<br>(Units)</th><th>ResQ - Johor Bahru<br>(Units)</th><th>ResQ - Pahang<br>(Units)</th><th>ResQ - Pulau Pinang<br>(Units)</th><th>Total All ResQ<br>(Units)</th></tr></thead><tbody>' + (resqBody || '<tr><td colspan="6">No ResQ data is available.</td></tr>') + '</tbody></table>' +
      '<p class="email-section-lead">As for <strong>warranty</strong> tracking, please refer to the following:</p>' + operationsTableStart('warranty', 'operations-warranty-table') + '<thead><tr><th>Date</th><th>Total number of warranty cases attended</th><th>Number of warranty cases attended (twice)</th><th>Number of warranty cases attended (3x)</th></tr></thead><tbody>' + (warrantyBody || '<tr><td colspan="4">No warranty data is available.</td></tr>') + '</tbody></table></div>';
    return '<section class="email-summary-view operations-summary-view"><div class="email-summary-toolbar"><div><span class="eyebrow">Email-ready report</span><h2>Operations summary</h2><p>RSA, B2W, ResQ, and Warranty only.</p><small class="summary-source">Uses the same selected report window and data sources as Summary.</small></div><div class="email-summary-actions">' + summaryCopyButton('Copy operations summary') + '</div></div>' + summarySourceHealthMarkup('operations-summary', reportDate) + content + '</section>';
  }

  // Combined email-ready BGarage and Indonesia report. Their dedicated
  // interactive dashboard tabs remain available for analysis.
  function renderIndonesiaSummary() {
    var reportDate = state.to || lastDate();
    var bgarageRows = emailLatestBGarageSnapshot(reportDate), sumBg = function(key) { return bgarageRows.reduce(function(sum, row) { return sum + numberValue(row[key]); }, 0); }, bgTarget = sumBg('dailyTarget'), bgActual = sumBg('dailyActual'), bgMtd = sumBg('mtdActual'), bgMonthly = sumBg('monthlyTarget'), bgReferrals = sumBg('referrals'), bgConversions = sumBg('conversions'), bgPickDrop = sumBg('pickDrop'), bgIntake = sumBg('intakeActual'), bgIntakeTarget = sumBg('intakeTarget');
    var bgSalesRows = bgarageRows.map(function(row) { var status = performanceStatus(row.dailyAchievement, row.dailyTarget, state.data.thresholds); return '<tr><td>' + escapeHtml(row.outlet) + '</td><td>' + formatBGarageMoney(row.dailyTarget) + '</td><td>' + formatBGarageMoney(row.dailyActual) + '</td><td>' + formatAchievement(row.dailyAchievement) + '</td><td class="email-performance ' + status + '">' + performanceLabel(status) + '</td><td>' + formatAchievement(row.mtdAchievement) + '</td><td>' + formatBGarageMoney(row.mtdActual) + '</td><td>' + formatBGarageMoney(row.monthlyTarget) + '</td><td>' + formatBGarageMoney(row.shortfall) + '</td></tr>'; }).join('');
    var bgLeadRows = bgarageRows.map(function(row) { var conversion = row.referrals ? Math.round(row.conversions / row.referrals * 100) : 0, status = performanceStatus(row.intakeAchievement, row.intakeTarget, state.data.thresholds); return '<tr><td>' + escapeHtml(row.outlet) + '</td><td>' + formatNumber(row.referrals) + '</td><td>' + formatNumber(row.conversions) + '</td><td>' + conversion + '%</td><td>' + formatNumber(row.pickDrop) + '</td><td>' + formatNumber(row.intakeActual) + '</td><td>' + formatNumber(row.intakeTarget) + '</td><td>' + formatAchievement(row.intakeAchievement) + '</td><td class="email-performance ' + status + '">' + performanceLabel(status) + '</td></tr>'; }).join('');
    var bgAchievement = bgTarget ? Math.round(bgActual / bgTarget * 100) : null, bgStatus = performanceStatus(bgAchievement, bgTarget, state.data.thresholds), bgMtdAchievement = bgMonthly ? Math.round(bgMtd / bgMonthly * 100) : null, bgIntakeAchievement = bgIntakeTarget ? Math.round(bgIntake / bgIntakeTarget * 100) : 0, bgIntakeStatus = performanceStatus(bgIntakeAchievement, bgIntakeTarget, state.data.thresholds);
    var indonesiaRows = (state.data.indonesia || []).filter(function(row) {
      return !!row.date && (!state.from || row.date >= state.from) && (!reportDate || row.date <= reportDate);
    }).sort(function(a, b) { return a.date.localeCompare(b.date); });
    var indonesiaLatestDate = indonesiaRows.length ? indonesiaRows[indonesiaRows.length - 1].date : '';
    var indonesiaLatest = indonesiaRows.filter(function(row) { return row.date === indonesiaLatestDate; });
    var indonesiaMonthRows = (state.data.indonesia || []).filter(function(row) {
      return indonesiaLatestDate && row.date.slice(0, 7) === indonesiaLatestDate.slice(0, 7) && row.date >= state.from && row.date <= indonesiaLatestDate;
    });
    var indonesiaMonth = indonesiaGroupedRows(indonesiaMonthRows);
    var content = '<div class="email-summary-document operations-summary-document indonesia-summary-document" id="emailSummaryContent">' +
      '<p class="email-major-lead"><strong>Below is BGarage Sales Report &amp; Performance:</strong></p><p>Reporting date: ' + escapeHtml(formatDate(reportDate, true)) + '</p><p><strong>Status classification:</strong></p><table class="email-table email-classification"><thead><tr><th>Achievement</th><th>Status</th></tr></thead><tbody><tr><td>&ge;100%</td><td class="email-performance achieved">Achieved</td></tr><tr><td>80%&ndash;99%</td><td class="email-performance near">Near Target</td></tr><tr><td>60%&ndash;79%</td><td class="email-performance below">Below Target</td></tr><tr><td>&lt;60%</td><td class="email-performance critical">Critical</td></tr><tr><td>No target</td><td class="email-performance na">N/A</td></tr></tbody></table>' +
      '<p><strong>A. Sales Performance</strong></p><div class="email-table-scroll"><table class="email-table email-bgarage-table"><thead><tr><th>BGarage Outlet</th><th>Daily Sales Target (RM)</th><th>Daily Actual Sales (RM)</th><th>Daily Achievement (%)</th><th>Sales Status</th><th>MTD Sales Achievement (%)</th><th>MTD Actual Sales (RM)</th><th>Monthly Target</th><th>MTD Sales Shortfall (RM)</th></tr></thead><tbody>' + (bgSalesRows || '<tr><td colspan="9">No BGarage sales data is available.</td></tr>') + (bgSalesRows ? '<tr class="email-total-row"><td><strong>Total BGarage</strong></td><td>' + formatMoney(bgTarget) + '</td><td>' + formatMoney(bgActual) + '</td><td>' + formatAchievement(bgAchievement) + '</td><td class="email-performance ' + bgStatus + '">' + performanceLabel(bgStatus) + '</td><td>' + formatAchievement(bgMtdAchievement) + '</td><td>' + formatMoney(bgMtd) + '</td><td>' + formatMoney(bgMonthly) + '</td><td>' + formatMoney(bgMtd - bgMonthly) + '</td></tr>' : '') + '</tbody></table></div>' +
      '<p><strong>B. Conversion &amp; Intake Performance</strong></p><div class="email-table-scroll"><table class="email-table email-bgarage-table"><thead><tr><th>BGarage Outlet</th><th>Special Cases Referred</th><th>Successful Conversions</th><th>Conversion Rate (%)</th><th>Pick &amp; Drop Cases</th><th>Daily Intake Actual</th><th>Daily Intake Target</th><th>Intake Achievement (%)</th><th>Intake Status</th></tr></thead><tbody>' + (bgLeadRows || '<tr><td colspan="9">No BGarage lead-handling data is available.</td></tr>') + (bgLeadRows ? '<tr class="email-total-row"><td><strong>Total BGarage</strong></td><td>' + formatNumber(bgReferrals) + '</td><td>' + formatNumber(bgConversions) + '</td><td>' + (bgReferrals ? Math.round(bgConversions / bgReferrals * 100) : 0) + '%</td><td>' + formatNumber(bgPickDrop) + '</td><td>' + formatNumber(bgIntake) + '</td><td>' + formatNumber(bgIntakeTarget) + '</td><td>' + bgIntakeAchievement + '%</td><td class="email-performance ' + bgIntakeStatus + '">' + performanceLabel(bgIntakeStatus) + '</td></tr>' : '') + '</tbody></table></div>' +
      '<p class="email-major-lead"><strong>Below is Bateriku Indonesia Sales Report &amp; Performance:</strong></p>' +
      '<p><strong>BATERIKU INDONESIA &ndash; DAILY SALES REPORT</strong></p>' +
      '<p>Tarikh: ' + escapeHtml(formatDate(indonesiaLatestDate || reportDate, true)) + '</p>' +
      '<p><strong>Daily Performance Summary</strong></p>' +
      '<div class="email-table-scroll"><table class="email-table email-indonesia-table">' + emailIndonesiaHeader(true) + '<tbody>' + (indonesiaLatest.map(function(row) { return emailIndonesiaRow(row, true); }).join('') || '<tr><td colspan="13">No Indonesia daily data is available.</td></tr>') + '</tbody></table></div>' +
      '<p><strong>Cumulative Sales ' + escapeHtml(indonesiaLatestDate ? emailOrdinalDate(indonesiaLatestDate).split(' ')[1] : '') + ' Summary</strong></p>' +
      '<div class="email-table-scroll"><table class="email-table email-indonesia-table">' + emailIndonesiaHeader(false) + '<tbody>' + (indonesiaMonth.map(function(row) { return emailIndonesiaRow(row, false); }).join('') || '<tr><td colspan="12">No Indonesia cumulative data is available.</td></tr>') + '</tbody></table></div></div>';
    return '<section class="email-summary-view operations-summary-view indonesia-summary-view"><div class="email-summary-toolbar"><div><span class="eyebrow">Email-ready report</span><h2>BGarage &amp; Indonesia</h2><p>BGarage performance followed by daily and cumulative Indonesia sales.</p><small class="summary-source">Uses the selected report window and manually uploaded BGarage and Indonesia data.</small></div><div class="email-summary-actions"><button class="header-button email-copy-button" type="button" data-copy-email-summary>Copy BGarage &amp; Indonesia</button></div></div>' + content + '</section>';
  }

  function manualNumberInput(kind, section, row, field, value, money) {
    var attributes = ' data-' + kind + '-manual-input data-manual-section="' + section + '" data-manual-row="' + row + '" data-manual-field="' + field + '"';
    var inputValue = money ? formatMoneyInputValue(value) : (value === null || value === undefined ? '' : String(value));
    var input = '<input class="manual-report-input" type="' + (money ? 'text' : 'number') + '"' + (money ? ' data-manual-money' : ' min="0" step="0.01"') + ' inputmode="decimal" value="' + escapeHtml(inputValue) + '"' + attributes + '>';
    return money ? '<label class="manual-money-input"><span>RM</span>' + input + '</label>' : input;
  }

  function manualStatusFor(achievement, target) {
    if (!numberValue(target)) return { key: 'na', label: 'N/A' };
    if (achievement >= 100) return { key: 'achieved', label: 'Achieved' };
    if (achievement >= 80) return { key: 'near', label: 'Near Target' };
    if (achievement >= 60) return { key: 'below', label: 'Below Target' };
    return { key: 'critical', label: 'Critical' };
  }

  function defaultManualBGarage(reportDate) {
    var names = ['BGarage TTDI', 'BGarage Puncak Alam', 'TUHU Puchong', 'BGarage Kajang'];
    var live = emailLatestBGarageSnapshot(reportDate), byName = {};
    live.forEach(function(row) { byName[String(row.outlet || '').toLowerCase()] = row; });
    return { rows: names.map(function(name) {
      var row = byName[name.toLowerCase()] || {};
      return { outlet: name, dailyTarget: numberValue(row.dailyTarget), dailyActual: numberValue(row.dailyActual), mtdActual: numberValue(row.mtdActual), monthlyTarget: numberValue(row.monthlyTarget), referrals: numberValue(row.referrals), conversions: numberValue(row.conversions), pickDrop: numberValue(row.pickDrop), intakeActual: numberValue(row.intakeActual), intakeTarget: numberValue(row.intakeTarget) };
    }) };
  }

  function defaultManualIndonesia(reportDate) {
    var rows = (state.data.indonesia || []).filter(function(row) { return row.date && row.date <= reportDate; }).sort(function(a, b) { return a.date.localeCompare(b.date); });
    var latestDate = rows.length ? rows[rows.length - 1].date : reportDate, latest = rows.filter(function(row) { return row.date === latestDate; })[0] || {};
    function map(row) { return { pitstop: row.pitstop || 'Cengkareng', totalLead: numberValue(row.totalLead), pendingLead: numberValue(row.pendingLead), cancelledLead: numberValue(row.cancelledLead), baterikuJumpstart: numberValue(row.baterikuJumpstart), baterikuCharge: numberValue(row.baterikuCharge), baterikuWarranty: numberValue(row.baterikuWarranty), baterikuBattery: numberValue(row.baterikuBattery), partnerJumpstart: numberValue(row.partnerJumpstart), partnerBattery: numberValue(row.partnerBattery) }; }
    return { daily: map(latest), cumulative: manualIndonesiaCumulativeForReportDate(reportDate) };
  }

  function renderManualBGarageRows(rows, section) {
    return rows.map(function(row, index) {
      var dailyAchievement = numberValue(row.dailyTarget) ? Math.round(numberValue(row.dailyActual) / numberValue(row.dailyTarget) * 100) : 0;
      var mtdAchievement = numberValue(row.monthlyTarget) ? Math.round(numberValue(row.mtdActual) / numberValue(row.monthlyTarget) * 100) : 0;
      var status = manualStatusFor(dailyAchievement, row.dailyTarget), intakeAchievement = numberValue(row.intakeTarget) ? Math.round(numberValue(row.intakeActual) / numberValue(row.intakeTarget) * 100) : 0;
      var intakeStatus = manualStatusFor(intakeAchievement, row.intakeTarget);
      if (section === 'sales') return '<tr data-bg-row="' + index + '"><td><strong>' + escapeHtml(row.outlet) + '</strong></td><td>' + manualNumberInput('bgarage', 'sales', index, 'dailyTarget', row.dailyTarget, true) + '</td><td>' + manualNumberInput('bgarage', 'sales', index, 'dailyActual', row.dailyActual, true) + '</td><td data-bg-auto="dailyAchievement">' + dailyAchievement + '%</td><td class="email-performance ' + status.key + '" data-bg-auto="salesStatus">' + status.label + '</td><td data-bg-auto="mtdAchievement">' + mtdAchievement + '%</td><td>' + manualNumberInput('bgarage', 'sales', index, 'mtdActual', row.mtdActual, true) + '</td><td>' + manualNumberInput('bgarage', 'sales', index, 'monthlyTarget', row.monthlyTarget, true) + '</td><td data-bg-auto="shortfall">' + formatMoneyText(manualBGarageShortfall(row.mtdActual, row.monthlyTarget)) + '</td></tr>';
      return '<tr data-bg-lead-row="' + index + '"><td><strong>' + escapeHtml(row.outlet) + '</strong></td><td>' + manualNumberInput('bgarage', 'lead', index, 'referrals', row.referrals, false) + '</td><td>' + manualNumberInput('bgarage', 'lead', index, 'conversions', row.conversions, false) + '</td><td data-bg-auto="conversion">' + (numberValue(row.referrals) ? Math.round(numberValue(row.conversions) / numberValue(row.referrals) * 100) : 0) + '%</td><td>' + manualNumberInput('bgarage', 'lead', index, 'pickDrop', row.pickDrop, false) + '</td><td>' + manualNumberInput('bgarage', 'lead', index, 'intakeActual', row.intakeActual, false) + '</td><td>' + manualNumberInput('bgarage', 'lead', index, 'intakeTarget', row.intakeTarget, false) + '</td><td data-bg-auto="intakeAchievement">' + intakeAchievement + '%</td><td class="email-performance ' + intakeStatus.key + '" data-bg-auto="intakeStatus">' + intakeStatus.label + '</td></tr>';
    }).join('');
  }

  function indonesiaManualFields(section) {
    return section === 'daily'
      ? ['totalLead','pendingLead','cancelledLead','baterikuJumpstart','baterikuCharge','baterikuWarranty','baterikuBattery','partnerJumpstart','partnerBattery']
      : ['totalLead','pendingLead','cancelledLead','baterikuJumpstart','baterikuCharge','baterikuWarranty','baterikuBattery','partnerJumpstart','partnerBattery'];
  }

  function indonesiaManualRow(row, section, total, editable) {
    var key = total ? 'total' : section, fields = indonesiaManualFields(section), dateLabel = escapeHtml(formatSummaryDate(manualEntryDate('indonesia'))), isEditable = editable !== false;
    if (total) {
      return '<tr class="email-total-row" data-indonesia-total="' + section + '"><td colspan="2"><strong>Total</strong></td>' + fields.map(function(field) { return '<td data-id-auto="' + field + '">0</td>'; }).join('') + '<td data-id-auto="totalJumpstart">0</td><td data-id-auto="totalBattery">0</td><td data-id-auto="jumpstartConversion">0%</td><td data-id-auto="batteryConversion">0%</td></tr>';
    }
    return '<tr data-indonesia-row="' + section + '"><td><strong>' + escapeHtml(row.pitstop || 'Cengkareng') + '</strong></td><td>' + dateLabel + '</td>' + fields.map(function(field) { return '<td' + (isEditable ? '' : ' data-id-auto="' + field + '"') + '>' + (isEditable ? manualNumberInput('indonesia', section, key, field, row[field], false) : formatNumber(numberValue(row[field]))) + '</td>'; }).join('') + '<td data-id-auto="totalJumpstart">0</td><td data-id-auto="totalBattery">0</td><td data-id-auto="jumpstartConversion">0%</td><td data-id-auto="batteryConversion">0%</td></tr>';
  }

  function manualIndonesiaMonthName() {
    var reportDate = manualEntryDate('indonesia');
    if (!reportDate) return 'Month';
    return new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(reportDate + 'T00:00:00Z'));
  }

  function manualIndonesiaReportDateMarkup(reportDate) {
    var latestDate = indonesiaSummaryLatestDate();
    return '<p class="manual-reporting-date"><span>Reporting date: ' + escapeHtml(formatSummaryDate(reportDate)) + '</span><label class="manual-reporting-date-editor" data-copy-exclude>Edit date <input type="date" data-indonesia-summary-date value="' + escapeHtml(reportDate) + '"' + (latestDate ? ' max="' + escapeHtml(latestDate) + '"' : '') + ' aria-label="Indonesia reporting date" title="Choose the Indonesia reporting date"></label></p>';
  }

  function manualBGarageReportDateMarkup(reportDate) {
    var latestDate = bgarageSummaryLatestDate();
    return '<p class="manual-reporting-date"><span>Reporting date: ' + escapeHtml(formatSummaryDate(reportDate)) + '</span><label class="manual-reporting-date-editor" data-copy-exclude>Edit date <input type="date" data-bgarage-summary-date value="' + escapeHtml(reportDate) + '"' + (latestDate ? ' max="' + escapeHtml(latestDate) + '"' : '') + ' aria-label="BGarage reporting date" title="Choose the BGarage reporting date"></label></p>';
  }

  function manualIndonesiaHeader(section) {
    var salesLabel = section === 'daily' ? 'Daily Sales' : 'Total ' + manualIndonesiaMonthName() + ' Sales';
    var totalLabel = section === 'daily' ? 'Total Daily Sales' : 'Total Sales';
    var dateLabel = section === 'daily' ? 'Date' : 'As of';
    return '<thead>' +
      '<tr class="email-indonesia-group-row"><th colspan="5"></th><th colspan="6">' + salesLabel + '</th><th colspan="2" rowspan="2">' + totalLabel + '</th><th colspan="2" rowspan="2">Conversion rate</th></tr>' +
      '<tr class="email-indonesia-group-row"><th colspan="5"></th><th colspan="4">BATERIKU SALES</th><th colspan="2">PARTNER SALES</th></tr>' +
      '<tr><th>Pitstop</th><th>' + dateLabel + '</th><th>Total<br>Lead</th><th>Pending Lead</th><th>Cancelled<br>Lead</th><th>Jumpstart</th><th>Charge</th><th>Warranty</th><th>Battery</th><th>Jumpstart</th><th>Battery</th><th>Jumpstart</th><th>Battery</th><th>Jumpstart</th><th>Battery</th></tr>' +
      '</thead>';
  }

  function renderManualSummaryCombined(viewMode) {
    var defaultReportDate = viewMode === 'bgarage' ? bgarageSummaryLatestDate() : indonesiaSummaryLatestDate(), reportDate = viewMode === 'bgarage' ? normalizeBGarageSummaryDate(state.bgarageSummaryDate || defaultReportDate) : normalizeIndonesiaSummaryDate(state.indonesiaSummaryDate || defaultReportDate);
    var bgData = state.manualBGarageSummaryValues[reportDate] || defaultManualBGarage(reportDate), bgRows = bgData.rows || defaultManualBGarage(reportDate).rows;
    var indonesia = state.manualIndonesiaSummaryValues[reportDate] || defaultManualIndonesia(reportDate), indonesiaCumulative = manualIndonesiaCumulativeForReportDate(reportDate);
    var content = '<div class="email-summary-document operations-summary-document indonesia-summary-document manual-combined-report" id="emailSummaryContent" data-copy-variant="' + viewMode + '-summary">' +
      '<div class="manual-section-heading"><p class="email-major-lead"><strong>Below is BGarage Sales Report &amp; Performance:</strong></p><button class="header-button manual-save-button" type="button" data-save-bgarage-summary data-copy-exclude>' + (state.bgarageSummarySaving ? 'Saving...' : 'Save BGarage') + '</button></div>' + manualBGarageReportDateMarkup(reportDate) + '<p><strong>Status classification:</strong></p><table class="email-table email-classification"><thead><tr><th>Achievement</th><th>Status</th></tr></thead><tbody><tr><td>&ge;100%</td><td class="email-performance achieved">Achieved</td></tr><tr><td>80%&ndash;99%</td><td class="email-performance near">Near Target</td></tr><tr><td>60%&ndash;79%</td><td class="email-performance below">Below Target</td></tr><tr><td>&lt;60%</td><td class="email-performance critical">Critical</td></tr><tr><td>No target</td><td class="email-performance na">N/A</td></tr></tbody></table>' +
      '<p><strong>A. Sales Performance</strong></p><div class="email-table-scroll"><table class="email-table email-bgarage-table manual-bgarage-table"><thead><tr><th>BGarage Outlet</th><th>Daily Sales Target (RM)</th><th>Daily Actual Sales (RM)</th><th>Daily Achievement (%)</th><th>Sales Status</th><th>MTD Sales Achievement (%)</th><th>MTD Actual Sales (RM)</th><th>Monthly Target</th><th>MTD Sales Shortfall (RM)</th></tr></thead><tbody>' + renderManualBGarageRows(bgRows, 'sales') + '<tr class="email-total-row" data-bg-total="sales"><td><strong>Total BGarage</strong></td>' + '<td data-bg-total-cell="dailyTarget"></td><td data-bg-total-cell="dailyActual"></td><td data-bg-total-cell="dailyAchievement"></td><td data-bg-total-cell="salesStatus"></td><td data-bg-total-cell="mtdAchievement"></td><td data-bg-total-cell="mtdActual"></td><td data-bg-total-cell="monthlyTarget"></td><td data-bg-total-cell="shortfall"></td></tr></tbody></table></div>' +
      '<p><strong>B. Conversion &amp; Intake Performance</strong></p><div class="email-table-scroll"><table class="email-table email-bgarage-table manual-bgarage-table"><thead><tr><th>BGarage Outlet</th><th>Special Cases Referred</th><th>Successful Conversions</th><th>Conversion Rate (%)</th><th>Pick &amp; Drop Cases</th><th>Daily Intake Actual</th><th>Daily Intake Target</th><th>Intake Achievement (%)</th><th>Intake Status</th></tr></thead><tbody>' + renderManualBGarageRows(bgRows, 'lead') + '<tr class="email-total-row" data-bg-total="lead"><td><strong>Total BGarage</strong></td><td data-bg-total-cell="referrals"></td><td data-bg-total-cell="conversions"></td><td data-bg-total-cell="conversion"></td><td data-bg-total-cell="pickDrop"></td><td data-bg-total-cell="intakeActual"></td><td data-bg-total-cell="intakeTarget"></td><td data-bg-total-cell="intakeAchievement"></td><td data-bg-total-cell="intakeStatus"></td></tr></tbody></table></div>' +
      '<div class="manual-section-heading"><p class="email-major-lead"><strong>Below is Bateriku Indonesia Sales Report &amp; Performance:</strong></p><button class="header-button manual-save-button" type="button" data-save-indonesia-summary data-copy-exclude>' + (state.indonesiaSummarySaving ? 'Saving...' : 'Save Indonesia') + '</button></div>' + manualIndonesiaReportDateMarkup(reportDate) + '<p><strong>Daily Performance Summary</strong></p><div class="email-table-scroll"><table class="email-table email-indonesia-table manual-indonesia-table">' + manualIndonesiaHeader('daily') + '<tbody>' + indonesiaManualRow(indonesia.daily || {}, 'daily', false, true) + indonesiaManualRow({}, 'daily', true) + '</tbody></table></div>' +
      '<p><strong>Cumulative Sales ' + escapeHtml(manualIndonesiaMonthName()) + ' Summary</strong></p><div class="email-table-scroll"><table class="email-table email-indonesia-table manual-indonesia-table">' + manualIndonesiaHeader('cumulative') + '<tbody>' + indonesiaManualRow(indonesiaCumulative, 'cumulative', false, false) + indonesiaManualRow({}, 'cumulative', true) + '</tbody></table></div></div>';
    return '<section class="email-summary-view operations-summary-view indonesia-summary-view"><div class="email-summary-toolbar"><div><span class="eyebrow">Email-ready report</span><h2>BGarage &amp; Indonesia</h2><p>Enter the daily values; calculated percentages, statuses and totals update automatically.</p><small class="summary-source">BGarage and Indonesia are saved independently for ' + escapeHtml(formatSummaryDate(reportDate)) + '.</small></div><div class="email-summary-actions">' + summaryCopyButton('Copy BGarage &amp; Indonesia') + '</div></div>' + summarySourceHealthMarkup(viewMode + '-summary', reportDate) + content + '</section>';
  }

  function renderManualSummaryView(viewMode) {
    var title = viewMode === 'bgarage' ? 'BGarage' : 'Indonesia';
    var html = renderManualSummaryCombined(viewMode)
      .replace(/BGarage &amp; Indonesia/g, title)
      .replace(/BGarage and Indonesia/g, title)
      .replace('id="emailSummaryContent"', 'id="emailSummaryContent" data-manual-view="' + viewMode + '"');
    return html;
  }

  function renderManualBGarageSummary() {
    return renderManualSummaryView('bgarage');
  }

  function renderManualIndonesiaSummary() {
    return renderManualSummaryView('indonesia');
  }

  function applyManualSummaryVisibility() {
    var content = document.getElementById('emailSummaryContent');
    if (!content) return;
    var mode = content.getAttribute('data-manual-view');
    if (!mode) return;
    var children = Array.prototype.slice.call(content.children);
    var firstIndonesiaChild = 8;
    children.forEach(function(child, index) {
      var hidden = mode === 'bgarage' ? index >= firstIndonesiaChild : index < firstIndonesiaChild;
      child.hidden = hidden;
      if (hidden) child.setAttribute('data-copy-exclude', '');
      else child.removeAttribute('data-copy-exclude');
    });
  }

  function manualInputValue(input) {
    var value = Number(String(input && input.value !== undefined ? input.value : '').replace(/,/g, '').trim());
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function normalizeManualMoneyInput(input) {
    if (input && input.hasAttribute('data-manual-money')) input.value = formatMoneyInputValue(manualInputValue(input));
  }

  function setManualAutoCell(cell, value, status) {
    if (!cell) return;
    cell.textContent = value;
    if (status) {
      cell.className = 'email-performance ' + status.key;
      cell.textContent = status.label;
    }
  }

  function bgarageInputValue(section, rowIndex, field) {
    return manualInputValue(document.querySelector('[data-bgarage-manual-input][data-manual-section="' + section + '"][data-manual-row="' + rowIndex + '"][data-manual-field="' + field + '"]'));
  }

  function collectManualBGarageSummary() {
    var reportDate = manualEntryDate('bgarage'), stored = state.manualBGarageSummaryValues[reportDate] || defaultManualBGarage(reportDate);
    var rows = (stored.rows || defaultManualBGarage(reportDate).rows).map(function(row, index) {
      return {
        outlet: row.outlet,
        dailyTarget: bgarageInputValue('sales', index, 'dailyTarget'),
        dailyActual: bgarageInputValue('sales', index, 'dailyActual'),
        mtdActual: bgarageInputValue('sales', index, 'mtdActual'),
        monthlyTarget: bgarageInputValue('sales', index, 'monthlyTarget'),
        referrals: bgarageInputValue('lead', index, 'referrals'),
        conversions: bgarageInputValue('lead', index, 'conversions'),
        pickDrop: bgarageInputValue('lead', index, 'pickDrop'),
        intakeActual: bgarageInputValue('lead', index, 'intakeActual'),
        intakeTarget: bgarageInputValue('lead', index, 'intakeTarget')
      };
    });
    return { rows: rows };
  }

  function updateManualBGarageCalculations() {
    var data = collectManualBGarageSummary(), totals = { dailyTarget: 0, dailyActual: 0, mtdActual: 0, monthlyTarget: 0, referrals: 0, conversions: 0, pickDrop: 0, intakeActual: 0, intakeTarget: 0 };
    data.rows.forEach(function(row, index) {
      Object.keys(totals).forEach(function(key) { totals[key] += numberValue(row[key]); });
      var dailyAchievement = row.dailyTarget ? Math.round(row.dailyActual / row.dailyTarget * 100) : 0;
      var mtdAchievement = row.monthlyTarget ? Math.round(row.mtdActual / row.monthlyTarget * 100) : 0;
      var salesStatus = manualStatusFor(dailyAchievement, row.dailyTarget);
      var salesRow = document.querySelector('[data-bg-row="' + index + '"]');
      if (salesRow) {
        setManualAutoCell(salesRow.querySelector('[data-bg-auto="dailyAchievement"]'), dailyAchievement + '%');
        setManualAutoCell(salesRow.querySelector('[data-bg-auto="salesStatus"]'), '', salesStatus);
        setManualAutoCell(salesRow.querySelector('[data-bg-auto="mtdAchievement"]'), mtdAchievement + '%');
        setManualAutoCell(salesRow.querySelector('[data-bg-auto="shortfall"]'), formatMoneyText(manualBGarageShortfall(row.mtdActual, row.monthlyTarget)));
      }
      var conversion = row.referrals ? Math.round(row.conversions / row.referrals * 100) : 0;
      var intakeAchievement = row.intakeTarget ? Math.round(row.intakeActual / row.intakeTarget * 100) : 0;
      var intakeStatus = manualStatusFor(intakeAchievement, row.intakeTarget);
      var leadRow = document.querySelector('[data-bg-lead-row="' + index + '"]');
      if (leadRow) {
        setManualAutoCell(leadRow.querySelector('[data-bg-auto="conversion"]'), conversion + '%');
        setManualAutoCell(leadRow.querySelector('[data-bg-auto="intakeAchievement"]'), intakeAchievement + '%');
        setManualAutoCell(leadRow.querySelector('[data-bg-auto="intakeStatus"]'), '', intakeStatus);
      }
    });
    var totalDailyAchievement = totals.dailyTarget ? Math.round(totals.dailyActual / totals.dailyTarget * 100) : 0;
    var totalMtdAchievement = totals.monthlyTarget ? Math.round(totals.mtdActual / totals.monthlyTarget * 100) : 0;
    var totalSalesStatus = manualStatusFor(totalDailyAchievement, totals.dailyTarget);
    var totalConversion = totals.referrals ? Math.round(totals.conversions / totals.referrals * 100) : 0;
    var totalIntakeAchievement = totals.intakeTarget ? Math.round(totals.intakeActual / totals.intakeTarget * 100) : 0;
    var totalIntakeStatus = manualStatusFor(totalIntakeAchievement, totals.intakeTarget);
    var salesTotal = document.querySelector('[data-bg-total="sales"]'), leadTotal = document.querySelector('[data-bg-total="lead"]');
    if (salesTotal) {
      setManualAutoCell(salesTotal.querySelector('[data-bg-total-cell="dailyTarget"]'), formatMoneyText(totals.dailyTarget));
      setManualAutoCell(salesTotal.querySelector('[data-bg-total-cell="dailyActual"]'), formatMoneyText(totals.dailyActual));
      setManualAutoCell(salesTotal.querySelector('[data-bg-total-cell="dailyAchievement"]'), totalDailyAchievement + '%');
      setManualAutoCell(salesTotal.querySelector('[data-bg-total-cell="salesStatus"]'), '', totalSalesStatus);
      setManualAutoCell(salesTotal.querySelector('[data-bg-total-cell="mtdAchievement"]'), totalMtdAchievement + '%');
      setManualAutoCell(salesTotal.querySelector('[data-bg-total-cell="mtdActual"]'), formatMoneyText(totals.mtdActual));
      setManualAutoCell(salesTotal.querySelector('[data-bg-total-cell="monthlyTarget"]'), formatMoneyText(totals.monthlyTarget));
      setManualAutoCell(salesTotal.querySelector('[data-bg-total-cell="shortfall"]'), formatMoneyText(manualBGarageShortfall(totals.mtdActual, totals.monthlyTarget)));
    }
    if (leadTotal) {
      setManualAutoCell(leadTotal.querySelector('[data-bg-total-cell="referrals"]'), formatNumber(totals.referrals));
      setManualAutoCell(leadTotal.querySelector('[data-bg-total-cell="conversions"]'), formatNumber(totals.conversions));
      setManualAutoCell(leadTotal.querySelector('[data-bg-total-cell="conversion"]'), totalConversion + '%');
      setManualAutoCell(leadTotal.querySelector('[data-bg-total-cell="pickDrop"]'), formatNumber(totals.pickDrop));
      setManualAutoCell(leadTotal.querySelector('[data-bg-total-cell="intakeActual"]'), formatNumber(totals.intakeActual));
      setManualAutoCell(leadTotal.querySelector('[data-bg-total-cell="intakeTarget"]'), formatNumber(totals.intakeTarget));
      setManualAutoCell(leadTotal.querySelector('[data-bg-total-cell="intakeAchievement"]'), totalIntakeAchievement + '%');
      setManualAutoCell(leadTotal.querySelector('[data-bg-total-cell="intakeStatus"]'), '', totalIntakeStatus);
    }
    return data;
  }

  function collectManualIndonesiaSummary(includeDailyOverride) {
    var reportDate = manualEntryDate('indonesia'), stored = state.manualIndonesiaSummaryValues[reportDate] || defaultManualIndonesia(reportDate);
    function collectDaily() {
      var current = stored.daily || {}, result = { pitstop: current.pitstop || 'Cengkareng' };
      indonesiaManualFields('daily').forEach(function(field) {
        result[field] = manualInputValue(document.querySelector('[data-indonesia-manual-input][data-manual-section="daily"][data-manual-field="' + field + '"]'));
      });
      return result;
    }
    var daily = collectDaily();
    return { daily: daily, cumulative: manualIndonesiaCumulativeForReportDate(reportDate, includeDailyOverride ? daily : undefined) };
  }

  function updateManualIndonesiaCalculations(includeDailyOverride) {
    var data = collectManualIndonesiaSummary(!!includeDailyOverride);
    ['daily', 'cumulative'].forEach(function(section) {
      var row = data[section], totalJumpstart = numberValue(row.baterikuJumpstart) + numberValue(row.partnerJumpstart);
      var totalBattery = numberValue(row.baterikuBattery) + numberValue(row.partnerBattery);
      var jumpstartConversion = row.totalLead ? totalJumpstart / row.totalLead * 100 : 0;
      var batteryConversion = row.totalLead ? totalBattery / row.totalLead * 100 : 0;
      var values = {
        totalJumpstart: totalJumpstart,
        totalBattery: totalBattery,
        jumpstartConversion: jumpstartConversion.toFixed(1) + '%',
        batteryConversion: batteryConversion.toFixed(1) + '%'
      };
      var normalRow = document.querySelector('[data-indonesia-row="' + section + '"]');
      var totalRow = document.querySelector('[data-indonesia-total="' + section + '"]');
      if (section === 'cumulative' && normalRow) indonesiaManualFields(section).forEach(function(field) { setManualAutoCell(normalRow.querySelector('[data-id-auto="' + field + '"]'), formatNumber(numberValue(row[field]))); });
      if (normalRow) Object.keys(values).forEach(function(key) { setManualAutoCell(normalRow.querySelector('[data-id-auto="' + key + '"]'), values[key]); });
      if (totalRow) {
        indonesiaManualFields(section).forEach(function(field) { setManualAutoCell(totalRow.querySelector('[data-id-auto="' + field + '"]'), formatNumber(numberValue(row[field]))); });
        Object.keys(values).forEach(function(key) { setManualAutoCell(totalRow.querySelector('[data-id-auto="' + key + '"]'), values[key]); });
      }
    });
    return data;
  }

  function validateManualReportInputs(kind) {
    var invalid = Array.from(document.querySelectorAll('[data-' + kind + '-manual-input]')).some(function(input) {
      var text = input.value.replace(/,/g, '').trim(), value = Number(text);
      return text === '' || !Number.isFinite(value) || value < 0 || value > 1000000000 || !input.hasAttribute('data-manual-money') && !Number.isInteger(value);
    });
    if (invalid) showToast('Complete every value with a valid non-negative number. Use zero only when confirmed.');
    return !invalid;
  }

  async function saveManualBGarageSummary() {
    if (state.bgarageSummarySaving || !validateManualReportInputs('bgarage')) return;
    var reportDate = manualEntryDate('bgarage');
    if (manualReportHasSavedDate('bgarage', reportDate)) {
      var confirmed = await confirmSummaryOverwrite({
        title: 'Overwrite BGarage data?',
        message: 'BGarage already has saved data for ' + formatSummaryDate(reportDate) + '. Saving will replace the existing record for this date.'
      });
      if (!confirmed) return;
    }
    await persistManualReportValue('bgarage', reportDate, updateManualBGarageCalculations());
  }

  async function saveManualIndonesiaSummary() {
    if (state.indonesiaSummarySaving || !validateManualReportInputs('indonesia')) return;
    var reportDate = manualEntryDate('indonesia');
    if (manualReportHasSavedDate('indonesia', reportDate)) {
      var confirmed = await confirmSummaryOverwrite({
        title: 'Overwrite Indonesia data?',
        message: 'Indonesia already has saved data for ' + formatSummaryDate(reportDate) + '. Saving will replace the existing record for this date.'
      });
      if (!confirmed) return;
    }
    await persistManualReportValue('indonesia', reportDate, updateManualIndonesiaCalculations(true));
  }

  function setBGarageSummaryDate(value) {
    var nextDate = normalizeBGarageSummaryDate(value);
    if (!nextDate) return;
    state.bgarageSummaryDate = nextDate;
    render();
  }

  function setIndonesiaSummaryDate(value) {
    var nextDate = normalizeIndonesiaSummaryDate(value);
    if (!nextDate) return;
    state.indonesiaSummaryDate = nextDate;
    render();
  }

  // A compact, email-ready view for users who only need the report header and
  // daily sales table. The complete Summary tab remains available separately.
  function renderSummaryHeader() {
    var normalSalesRows = emailGrafanaSalesRows(), reportDate = state.to || (normalSalesRows.length ? normalSalesRows[normalSalesRows.length - 1].date : lastDate()), salesRows = normalSalesRows, latest = salesRows[salesRows.length - 1], boundaryPrior = salesRows.length > 1 ? salesRows[salesRows.length - 2] : priorEmailSalesRow();
    var movingRows = salesRows.slice(-3), movingAverage = HOSTED_MODE && latest && Number.isFinite(numberValue(latest.movingAverageAll)) ? numberValue(latest.movingAverageAll) : movingRows.length ? Math.round(movingRows.reduce(function(sum, row) { return sum + totalSales(row); }, 0) / movingRows.length) : 0;
    var salesBody = salesRows.map(function(row, index) {
      var prior = index > 0 ? salesRows[index - 1] : boundaryPrior;
      var movement = prior ? totalSales(row) >= totalSales(prior) ? 'Increase' : 'Decrease' : 'First day';
      return '<tr><td>' + escapeHtml(formatSummaryDate(row.date)) + '</td><td>' + formatNumber(row.b2c) + '</td><td>' + formatNumber(row.b2b2c) + '</td><td>' + formatNumber(totalSales(row)) + '</td><td class="email-movement ' + (movement === 'Decrease' ? 'decrease' : '') + '">' + movement + '</td></tr>';
    }).join('');
    var emptyMessage = state.emailSalesLoading ? 'Loading Order - Daily data from Grafana...' : state.emailSalesError ? escapeHtml(state.emailSalesError) : 'No sales data is available.';
    var content = '<div class="email-summary-document" id="emailSummaryContent" data-copy-variant="summary-header"><p class="email-summary-greeting">Dear all,</p><p class="email-summary-intro">This is the sales report for our <strong>B2C and B2B2C</strong> channels as of <strong>' + escapeHtml(formatSummaryDate(reportDate)) + '</strong>. The moving average for our total sales as of yesterday was <strong>' + formatNumber(movingAverage) + ' units</strong>. Please refer to the details below:</p>' +
      '<table class="email-table email-sales-table"><thead><tr><th>Date</th><th>B2C (Units)</th><th>B2B2C (Units)</th><th>Total (Units)</th><th>Movement</th></tr></thead><tbody>' + (salesBody || '<tr><td colspan="5">' + emptyMessage + '</td></tr>') + '</tbody></table></div>';
    return '<section class="email-summary-view summary-header-view"><div class="email-summary-toolbar"><div><span class="eyebrow">Email-ready report</span><h2>Daily report summary</h2><p>Copy the formatted report header and daily sales table directly into Outlook.</p><small class="summary-source">Sales source: ' + escapeHtml(HOSTED_MODE ? (state.grafanaEmailSalesSource || 'Grafana Order - Daily') : 'Standalone report data') + '</small></div><div class="email-summary-actions">' + summaryCopyButton('Copy all summary') + '</div></div>' + summarySourceHealthMarkup('summary-header', reportDate) + content + '</section>';
  }

  function renderServices() {
    var rows = rowsInRange(), services = [{ key: 'rsaJumpstart', label: 'RSA jumpstart', color: '#0f766e' }, { key: 'rsaTyrePatch', label: 'RSA tyre patch', color: '#1479a8' }, { key: 'rsaFuel', label: 'RSA fuel', color: '#c48714' }, { key: 'b2w', label: 'B2W', color: '#7051b8' }, { key: 'resQ', label: 'ResQ', color: '#c74d42' }], serviceTotals = services.map(function(series) { return { ...series, value: rows.reduce(function(sum, row) { return sum + serviceValue(row, series.key); }, 0) }; }), warranty = [{ key: 'warranty1st', label: '1st attend', color: '#0f766e' }, { key: 'warranty2nd', label: '2nd attend', color: '#c48714' }, { key: 'warranty3rd', label: '3rd attend', color: '#c74d42' }].map(function(series) { return { ...series, value: rows.reduce(function(sum, row) { return sum + numberValue(row[series.key]); }, 0) }; });
    var maxService = Math.max.apply(Math, serviceTotals.map(function(series) { return series.value; }).concat([1])), maxWarranty = Math.max.apply(Math, warranty.map(function(series) { return series.value; }).concat([1])), serviceTotal = serviceTotals.reduce(function(sum, series) { return sum + series.value; }, 0), maxDaily = Math.max.apply(Math, rows.map(function(row) { return totalServices(row); }).concat([1]));
    var serviceHtml = serviceTotals.map(function(series) { return '<div class="service-row"><div class="service-row-top"><span><i class="mix-swatch" style="background:' + series.color + '"></i>' + series.label + '</span><strong>' + formatNumber(series.value) + '</strong></div><div class="progress-track"><span class="progress-fill" style="width:' + series.value / maxService * 100 + '%;background:' + series.color + '"></span></div><small>' + percentage(series.value, serviceTotal) + '% of service activity</small></div>'; }).join('');
    var warrantyHtml = warranty.map(function(series) { return '<div class="warranty-row"><div class="warranty-row-top"><span>' + series.label + '</span><strong>' + formatNumber(series.value) + '</strong></div><div class="progress-track"><span class="progress-fill" style="width:' + series.value / maxWarranty * 100 + '%;background:' + series.color + '"></span></div></div>'; }).join('');
    var bars = rows.map(function(row) { var value = totalServices(row); return '<div class="daily-bar-column"><span class="daily-bar-value">' + formatCompact(value) + '</span><div class="daily-bar-track"><span class="daily-bar" style="height:' + value / maxDaily * 100 + '%"></span></div><small>' + formatDate(row.date) + '</small></div>'; }).join('');
    var detailRows = rows.map(function(row) { return '<tr><td><strong>' + escapeHtml(formatDate(row.date, true)) + '</strong></td><td>' + formatNumber(row.rsaJumpstart) + '</td><td>' + formatNumber(row.rsaTyrePatch) + '</td><td>' + formatNumber(row.rsaFuel) + '</td><td><strong>' + formatNumber(row.rsaJumpstart + row.rsaTyrePatch + row.rsaFuel) + '</strong></td><td>' + formatNumber(row.b2w) + '</td><td>' + formatNumber(row.resQSelangor) + '</td><td>' + formatNumber(row.resQJb) + '</td><td>' + formatNumber(row.resQPahang) + '</td><td>' + formatNumber(row.resQPenang) + '</td><td><strong>' + formatNumber(row.resQ) + '</strong></td><td>' + formatNumber(row.warranty1st) + '</td><td>' + formatNumber(row.warranty2nd) + '</td><td>' + formatNumber(row.warranty3rd) + '</td></tr>'; }).join('');
    var detailPanel = '<article class="panel service-detail-panel"><div class="panel-header"><div><span class="eyebrow">Daily detail</span><h2>Services and warranty table</h2><p>All uploaded service categories for the selected report window.</p></div><span class="result-count">' + rows.length + ' days</span></div><div class="table-scroll"><table class="data-table service-detail-table"><thead><tr><th>Date</th><th>RSA jumpstart</th><th>RSA tyre patch</th><th>RSA fuel</th><th>Total RSA</th><th>B2W</th><th>ResQ Selangor</th><th>ResQ JB</th><th>ResQ Pahang</th><th>ResQ Penang</th><th>Total ResQ</th><th>Warranty 1st</th><th>Warranty 2nd</th><th>Warranty 3rd</th></tr></thead><tbody>' + (detailRows || '<tr><td colspan="14"><div class="empty-state">No service rows match this period.</div></td></tr>') + '</tbody></table></div></article>';
    return '<section class="services-grid"><article class="panel"><div class="panel-header"><div><span class="eyebrow">Services</span><h2>Support demand by type</h2><p>RSA, B2W, and ResQ cases for the selected period.</p></div></div><div class="service-list">' + serviceHtml + '</div><div class="summary-total"><span>Total service cases</span><strong>' + formatNumber(serviceTotal) + '</strong></div></article><article class="panel"><div class="panel-header"><div><span class="eyebrow">Warranty</span><h2>Attend mix</h2><p>Cases by first, second, and third attend.</p></div></div><div class="warranty-list">' + warrantyHtml + '</div><div class="warranty-note">First-attend cases are the primary warranty workload signal.</div></article><article class="panel service-trend-panel"><div class="panel-header"><div><span class="eyebrow">Daily volume</span><h2>Service trend</h2><p>Combined support cases across the selected dates.</p></div></div><div class="daily-bars">' + bars + '</div></article>' + detailPanel + '</section>';
  }

  function serviceDayLabel(iso) {
    if (!iso) return '';
    return formatDate(iso);
  }

  // Service charts use day numbers on the x-axis, with the month anchored
  // once at the lower right. Keep the full dd/mm/yyyy format elsewhere.
  function serviceChartDateLabel(iso) {
    var value = String(iso || '').slice(0, 10);
    var match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return serviceDayLabel(iso);
    return String(Number(match[3]));
  }

  function serviceChartMonthLabel(rows) {
    if (!rows.length) return '';
    var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var monthFor = function(iso) {
      var match = String(iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return '';
      return (monthNames[Number(match[2]) - 1] || match[2]) + ' ' + match[1];
    };
    var first = monthFor(rows[0].date), last = monthFor(rows[rows.length - 1].date);
    if (!first || first === last) return first.replace(/\s+\d{4}$/, '');
    return first + ' - ' + last;
  }

  function serviceLongDayLabel(iso) {
    if (!iso) return 'No date';
    return formatDate(iso, true);
  }

  function priorServiceChartDate(iso) {
    var value = String(iso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    var date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  function serviceChartPriorValue(date, key) {
    var priorDate = priorServiceChartDate(date);
    if (!priorDate) return null;
    if (key === 'b2w' && hasManualB2w(priorDate)) return manualB2wValue(priorDate);
    if (['rsaJumpstart', 'rsaTyrePatch', 'rsaFuel'].indexOf(key) !== -1 && hasManualRsa(priorDate, key)) return manualRsaValue(priorDate, key);
    if (HOSTED_MODE && (!state.resqApiAvailable || state.resqSyncRange !== selectedRangeKey())) {
      var savedUnavailableRow = (state.data.dailySales || []).find(function(row) { return row && row.date === priorDate; });
      return savedUnavailableRow && Number.isFinite(numberValue(savedUnavailableRow[key])) ? numberValue(savedUnavailableRow[key]) : 0;
    }

    var liveRow = (state.grafanaResqRows || []).find(function(row) { return row && row.date === priorDate; });
    if (liveRow) return numberValue(liveRow[key]);
    // A successful ResQ API query includes the prior date. Its absence means
    // zero cases for that calendar day, rather than a missing comparison.
    if (HOSTED_MODE && state.resqApiAvailable && state.resqSyncRange === selectedRangeKey()) return 0;
    var storedRows = (state.data.dailySales || []).filter(function(row) { return row && row.date && row.date <= priorDate; }).sort(function(a, b) { return a.date.localeCompare(b.date); });
    var storedRow = storedRows.pop();
    return storedRow && Number.isFinite(numberValue(storedRow[key])) ? numberValue(storedRow[key]) : 0;
  }

  function serviceChartPriorTotal(date, series) {
    var values = series.map(function(item) { return serviceChartPriorValue(date, item.key); });
    return values.every(Number.isFinite) ? values.reduce(function(sum, value) { return sum + value; }, 0) : null;
  }

  function serviceChartDeltaText(delta) {
    var value = Number.isFinite(delta) ? delta : 0;
    return (value > 0 ? '+' : '') + formatNumber(value);
  }

  function serviceChartDeltaMarkup(date, delta, x, y, className) {
    var value = Number.isFinite(delta) ? delta : 0, label = serviceChartDeltaText(value);
    var description = 'Previous day ' + serviceLongDayLabel(priorServiceChartDate(date)) + ': ' + label;
    return '<g class="service-prior-comparison"><title>' + escapeHtml(description) + '</title><text class="' + className + (value < 0 ? ' negative' : '') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" aria-label="' + escapeHtml(description) + '">' + escapeHtml(label) + '</text></g>';
  }

  function serviceControl(label, options) {
    return '<select class="chart-control" aria-label="' + escapeHtml(label) + '">' + options.map(function(option) { return '<option>' + escapeHtml(option) + '</option>'; }).join('') + '</select>';
  }

  function serviceCycleControl(label, dataKey, current, options) {
    var selected = options.find(function(option) { return option.value === current; }) || options[0];
    return '<button type="button" class="chart-control chart-cycle-control" data-cycle-filter="' + escapeHtml(dataKey) + '" aria-label="' + escapeHtml(label) + '">' + escapeHtml(selected.label) + ' <span aria-hidden="true">›</span></button>';
  }

  function resqSeriesList(filter) {
    var series = [{ key: 'resQSelangor', label: 'Selangor', className: 'resq-selangor' }, { key: 'resQJb', label: 'JB', className: 'resq-jb' }, { key: 'resQPahang', label: 'Pahang', className: 'resq-pahang' }, { key: 'resQPenang', label: 'Penang', className: 'resq-penang' }];
    return filter === 'all' ? series : series.filter(function(item) { return item.key === filter; });
  }

  function warrantyDateControl(rows) {
    var dates = Array.from(new Set(rows.map(function(row) { return row.date; }))).sort();
    var selected = dates.indexOf(state.warrantyDate) !== -1 ? state.warrantyDate : (dates[dates.length - 1] || '');
    return '<input type="date" lang="en-GB" class="chart-control warranty-date-control" data-warranty-date value="' + escapeHtml(selected) + '" min="' + escapeHtml(dates[0] || '') + '" max="' + escapeHtml(dates[dates.length - 1] || '') + '" aria-label="Filter warranty by date">';
  }

  function serviceHeader(title, subtitle, controls) {
    return '<div class="service-chart-header"><div><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(subtitle) + '</p></div><div class="service-chart-controls">' + controls + '<span class="chart-close" aria-hidden="true">×</span></div></div>';
  }

  function serviceFullscreenControl(index, title) {
    return '<button type="button" class="chart-fullscreen" data-service-fullscreen="' + index + '" aria-label="Open ' + escapeHtml(title) + ' fullscreen" title="Open fullscreen">⛶</button>';
  }

  function serviceFullscreenToolbar(index) {
    return '<div class="service-fullscreen-toolbar" role="toolbar" aria-label="Fullscreen visual navigation"><button type="button" class="service-nav-button" data-service-nav="prev" aria-label="Previous visual" title="Previous visual">←</button><span>Visual ' + (index + 1) + ' of 4</span><button type="button" class="service-nav-button" data-service-nav="next" aria-label="Next visual" title="Next visual">→</button><button type="button" class="service-exit-button" data-service-exit aria-label="Close fullscreen" title="Close fullscreen">×</button></div>';
  }

  function serviceChartKpis(items) {
    return '<div class="service-chart-kpis">' + items.map(function(item) {
      return '<div class="service-chart-kpi"><span>' + escapeHtml(item.label) + '</span><strong>' + escapeHtml(item.value) + '</strong></div>';
    }).join('') + '</div>';
  }

  function serviceGridMarkup(width, height, pad, chartMax, step, y) {
    var html = '';
    for (var tick = 0; tick <= chartMax + .001; tick += step) {
      var tickY = y(tick);
      html += '<line class="service-grid-line" x1="' + pad.left + '" x2="' + (width - pad.right) + '" y1="' + tickY.toFixed(1) + '" y2="' + tickY.toFixed(1) + '"></line><text class="service-axis service-y-axis" x="' + (pad.left - 8) + '" y="' + (tickY + 3.5).toFixed(1) + '" text-anchor="end">' + formatCompact(tick) + '</text>';
    }
    return html;
  }

  function serviceXMarkup(rows, x, labelY, monthX, monthY) {
    var dayLabels = rows.map(function(row, index) {
      return '<text class="service-axis service-x-axis" x="' + x(index).toFixed(1) + '" y="' + labelY.toFixed(1) + '" text-anchor="middle">' + escapeHtml(serviceChartDateLabel(row.date)) + '</text>';
    }).join('');
    var monthLabel = serviceChartMonthLabel(rows);
    return dayLabels + (monthLabel ? '<text class="service-axis service-month-axis" x="' + monthX.toFixed(1) + '" y="' + monthY.toFixed(1) + '" text-anchor="end">' + escapeHtml(monthLabel) + '</text>' : '');
  }

  function serviceStackedSvg(rows, series, max, step, ariaLabel, deltaConfig) {
    if (!rows.length) return '<div class="empty-state">No service rows match the selected period.</div>';
    var width = 560, height = 330, pad = { top: 34, right: 14, bottom: 54, left: 36 }, innerWidth = width - pad.left - pad.right, innerHeight = height - pad.top - pad.bottom, chartMax = Math.max(step, Math.ceil(max / step) * step), xStep = innerWidth / rows.length, x = function(index) { return pad.left + xStep * index + xStep / 2; }, y = function(value) { return pad.top + innerHeight - value / chartMax * innerHeight; }, barWidth = Math.max(12, Math.min(25, xStep * .62)), totals = rows.map(function(row) { return series.reduce(function(sum, item) { return sum + numberValue(row[item.key]); }, 0); }), singleSeries = series.length === 1;
    var html = '<svg class="service-svg stacked-service-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(ariaLabel) + '"><title>' + escapeHtml(ariaLabel) + '</title><desc>Stacked daily columns show each service component and its exact value.</desc>' + serviceGridMarkup(width, height, pad, chartMax, step, y);
    rows.forEach(function(row, index) { html += '<line class="service-grid-line vertical" x1="' + x(index).toFixed(1) + '" x2="' + x(index).toFixed(1) + '" y1="' + pad.top + '" y2="' + (pad.top + innerHeight) + '"></line>'; });
    rows.forEach(function(row, index) {
      if (series.some(function(item) { return !Number.isFinite(row[item.key]); })) return;
      var cumulative = 0, left = x(index) - barWidth / 2;
      series.forEach(function(item) {
        var value = numberValue(row[item.key]);
        if (!value) return;
        var top = y(cumulative + value), bottom = y(cumulative), segmentHeight = Math.max(2, bottom - top), label = formatNumber(value), labelWidth = Math.max(16, label.length * 5.2 + 7), labelY = segmentHeight >= 15 ? top + segmentHeight / 2 - 6 : Math.max(pad.top + 1, top + 1);
        html += '<rect class="stack-segment ' + item.className + '" x="' + left.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + segmentHeight.toFixed(1) + '"></rect><rect class="segment-label ' + item.className + '" x="' + (x(index) - labelWidth / 2).toFixed(1) + '" y="' + labelY.toFixed(1) + '" width="' + labelWidth.toFixed(1) + '" height="12" rx="2" ry="2"></rect><text class="segment-label-text" x="' + x(index).toFixed(1) + '" y="' + (labelY + 9).toFixed(1) + '" text-anchor="middle">' + escapeHtml(label) + '</text>';
        cumulative += value;
      });
      var total = totals[index], totalLabel = formatNumber(total), totalLabelWidth = Math.max(20, totalLabel.length * 5.2 + 8), totalLabelY = Math.max(18, y(total) - 18), totalClass = singleSeries ? series[0].className : 'total';
      var showDelta = deltaConfig ? !!deltaConfig.enabled : singleSeries, priorTotal = serviceChartPriorTotal(row.date, series), delta = priorTotal === null ? null : total - priorTotal;
      html += '<rect class="service-total-label ' + totalClass + '" x="' + (x(index) - totalLabelWidth / 2).toFixed(1) + '" y="' + totalLabelY.toFixed(1) + '" width="' + totalLabelWidth.toFixed(1) + '" height="14" rx="3" ry="3"></rect><text class="service-total-label-text" x="' + x(index).toFixed(1) + '" y="' + (totalLabelY + 10).toFixed(1) + '" text-anchor="middle">' + escapeHtml(totalLabel) + '</text>' + (showDelta ? serviceChartDeltaMarkup(row.date, delta, x(index), Math.max(10, totalLabelY - 5), 'service-total-delta') : '');
    });
    return html + serviceXMarkup(rows, x, height - 30, width - pad.right, height - 8) + '</svg>';
  }

  function serviceStackedLegend(series) {
    return '<div class="service-chart-legend">' + series.map(function(item) { return '<span><i class="legend-dot ' + item.className + '"></i>' + escapeHtml(item.label) + '</span>'; }).join('') + '</div>';
  }

  function serviceColumnSvg(rows, key, max, step, ariaLabel) {
    if (!rows.length) return '<div class="empty-state">No service rows match the selected period.</div>';
    var width = 560, height = 330, pad = { top: 34, right: 14, bottom: 54, left: 36 }, innerWidth = width - pad.left - pad.right, innerHeight = height - pad.top - pad.bottom, chartMax = Math.max(step, Math.ceil(max / step) * step), xStep = innerWidth / rows.length, x = function(index) { return pad.left + xStep * index + xStep / 2; }, y = function(value) { return pad.top + innerHeight - value / chartMax * innerHeight; }, baseline = y(0), values = rows.map(function(row) { return numberValue(row[key]); }), latestAvailableIndex = rows.reduce(function(found, row, index) { return Number.isFinite(row[key]) ? index : found; }, -1), barWidth = Math.max(20, Math.min(48, xStep * .46));
    var html = '<svg class="service-svg service-column-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(ariaLabel) + '"><title>' + escapeHtml(ariaLabel) + '</title><desc>Daily columns show B2W volume with exact values and change versus the prior day.</desc>' + serviceGridMarkup(width, height, pad, chartMax, step, y);
    rows.forEach(function(row, index) { html += '<line class="service-grid-line vertical" x1="' + x(index).toFixed(1) + '" x2="' + x(index).toFixed(1) + '" y1="' + pad.top + '" y2="' + baseline.toFixed(1) + '"></line>'; });
    values.forEach(function(value, index) {
      if (!Number.isFinite(rows[index][key])) return;
      var top = y(value), barHeight = Math.max(2, baseline - top), label = formatNumber(value), priorValue = serviceChartPriorValue(rows[index].date, key), delta = priorValue === null ? null : value - priorValue, deltaText = serviceChartDeltaText(delta), labelWidth = Math.max(20, label.length * 5.2 + 8), labelY = Math.max(2, top - 18);
      html += '<rect class="b2w-column' + (index === latestAvailableIndex ? ' is-latest' : '') + '" x="' + (x(index) - barWidth / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" rx="3" ry="3"><title>' + escapeHtml(serviceLongDayLabel(rows[index].date) + ': ' + label + ' pcs; ' + deltaText + ' from prior day') + '</title></rect><rect class="line-label" x="' + (x(index) - labelWidth / 2).toFixed(1) + '" y="' + labelY.toFixed(1) + '" width="' + labelWidth.toFixed(1) + '" height="14" rx="3" ry="3"></rect><text class="line-label-text" x="' + x(index).toFixed(1) + '" y="' + (labelY + 10).toFixed(1) + '" text-anchor="middle">' + escapeHtml(label) + '</text>' + serviceChartDeltaMarkup(rows[index].date, delta, x(index), Math.max(10, labelY - 5), 'b2w-delta');
    });
    return html + serviceXMarkup(rows, x, height - 30, width - pad.right, height - 8) + '</svg>';
  }

  function serviceWarrantySvg(latest) {
    if (!latest || !Number.isFinite(totalWarranty(latest))) return '<div class="empty-state">Warranty data is unavailable for this date.</div>';
    var values = [numberValue(latest && latest.warranty1st), numberValue(latest && latest.warranty2nd), numberValue(latest && latest.warranty3rd)], labels = ['1st Attend', '2nd Attend', '3rd Attend'], classes = ['warranty-first', 'warranty-second', 'warranty-third'], chartMax = Math.max(10, Math.ceil(Math.max.apply(Math, values.concat([1])) / 10) * 10), width = 560, height = 330, pad = { top: 22, right: 14, bottom: 54, left: 36 }, innerWidth = width - pad.left - pad.right, innerHeight = height - pad.top - pad.bottom, y = function(value) { return pad.top + innerHeight - value / chartMax * innerHeight; }, baseline = y(0), positions = [pad.left + innerWidth * .25, pad.left + innerWidth * .5, pad.left + innerWidth * .75], barWidth = Math.min(78, innerWidth * .18);
    var html = '<svg class="service-svg warranty-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Warranty cases by attend type for the latest day"><title>Warranty cases by attend type</title><desc>Latest-day warranty cases split into first, second, and third attend.</desc>' + serviceGridMarkup(width, height, pad, chartMax, 10, y);
    values.forEach(function(value, index) { var top = y(value), heightValue = Math.max(2, baseline - top), label = formatNumber(value), labelWidth = Math.max(19, label.length * 5.5 + 8), labelY = Math.max(pad.top + 1, top - 19); html += '<rect class="warranty-bar ' + classes[index] + '" x="' + (positions[index] - barWidth / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + heightValue.toFixed(1) + '" rx="4" ry="4"></rect><rect class="warranty-label ' + classes[index] + '" x="' + (positions[index] - labelWidth / 2).toFixed(1) + '" y="' + labelY.toFixed(1) + '" width="' + labelWidth.toFixed(1) + '" height="15" rx="3" ry="3"></rect><text class="warranty-label-text" x="' + positions[index].toFixed(1) + '" y="' + (labelY + 10.5).toFixed(1) + '" text-anchor="middle">' + escapeHtml(label) + '</text><text class="service-axis warranty-x-axis" x="' + positions[index].toFixed(1) + '" y="' + (height - 18) + '" text-anchor="middle">' + labels[index] + '</text>'; });
    return html + '</svg>';
  }

  function serviceWarrantyLegend() {
    return '<div class="service-chart-legend"><span><i class="legend-dot warranty-first"></i>1st Attend</span><span><i class="legend-dot warranty-second"></i>2nd Attend</span><span><i class="legend-dot warranty-third"></i>3rd Attend</span></div>';
  }

  function serviceSummaryMarkup(rows) {
    var activityForRow = function(row) { return totalServices(row) + totalWarranty(row); }, totalActivity = rows.reduce(function(sum, row) { return sum + activityForRow(row); }, 0), dailyAverage = rows.length ? totalActivity / rows.length : 0, highest = rows.slice().sort(function(a, b) { return activityForRow(b) - activityForRow(a); })[0], warrantyFirst = rows.reduce(function(sum, row) { return sum + row.warranty1st; }, 0), warrantyRepeat = rows.reduce(function(sum, row) { return sum + row.warranty2nd + row.warranty3rd; }, 0), warrantyTotal = warrantyFirst + warrantyRepeat, repeatRate = warrantyTotal ? warrantyRepeat / warrantyTotal * 100 : 0;
    var shortDate = function(iso) { return formatDate(iso, true); }, periodLabel = rows.length ? shortDate(rows[0].date) + ' to ' + shortDate(rows[rows.length - 1].date) + ' · ' + rows.length + ' available days' : 'No available days';
    var allRows = state.data.dailySales || [], startIndex = rows.length ? allRows.findIndex(function(row) { return row.date === rows[0].date; }) : -1, previousRows = startIndex > 0 ? allRows.slice(Math.max(0, startIndex - rows.length), startIndex) : [], previousActivity = previousRows.reduce(function(sum, row) { return sum + activityForRow(row); }, 0), trendValue = previousRows.length === rows.length && previousActivity ? (totalActivity - previousActivity) / previousActivity * 100 : null;
    var trendLabel = trendValue === null ? 'No comparison' : (trendValue >= 0 ? 'Up ' : 'Down ') + Math.abs(trendValue).toFixed(1) + '%', trendDetail = trendValue === null ? 'Previous period unavailable' : 'Compared with previous period', riskLabel = repeatRate < 3 ? 'On Track' : repeatRate < 5 ? 'Watch' : 'Action', riskDetail = repeatRate < 3 ? 'Below 3% repeat rate' : 'Above 3% repeat rate';
    var card = function(tone, label, value, detail) {
      var iconTone = tone === 'green' ? 'teal' : tone === 'amber' ? 'amber' : tone === 'risk' ? 'red' : 'blue';
      return '<article class="kpi-card compact-kpi-card service-kpi-card ' + tone + '"><div class="kpi-topline"><span class="kpi-icon ' + iconTone + '">' + escapeHtml(label.slice(0, 1)) + '</span><span class="service-kpi-label kpi-label">' + label + '</span></div><strong class="service-kpi-value kpi-value">' + value + '</strong><span class="service-kpi-detail kpi-detail">' + detail + '</span></article>';
    };
    return '<div class="service-period-label">' + escapeHtml(periodLabel) + '</div><div class="service-kpi-grid">' + card('blue', 'Total activity', formatNumber(totalActivity), 'RSA, B2W, ResQ and warranty') + card('blue', 'Daily average', dailyAverage.toFixed(1), 'Across ' + rows.length + ' available days') + card('green', 'Warranty first attendance', formatNumber(warrantyFirst), 'Cases in selected period') + card('green', 'Warranty repeat rate', repeatRate.toFixed(1) + '%', 'Repeat / all warranty attendance') + card(riskLabel === 'On Track' ? 'green' : 'risk', 'Service risk', riskLabel, riskDetail) + '</div>';
  }

  function serviceSummaryMarkupClean(rows, rsaSeries, resqSeries) {
    var rsaStats = serviceAvailableStats(rows, rsaSeries.map(function(series) { return series.key; }));
    var b2wStats = serviceAvailableStats(rows, ['b2w']);
    var resqStats = serviceAvailableStats(rows, resqSeries.map(function(series) { return series.key; }));
    var totalRsa = rsaStats.total;
    var totalB2w = b2wStats.total;
    var totalResq = resqStats.total;
    var warrantyFirst = rows.reduce(function(sum, row) { return sum + row.warranty1st; }, 0);
    var warrantyRepeat = rows.reduce(function(sum, row) { return sum + row.warranty2nd + row.warranty3rd; }, 0);
    var warrantyTotal = warrantyFirst + warrantyRepeat, repeatRate = Number.isFinite(warrantyTotal) ? (warrantyTotal ? warrantyRepeat / warrantyTotal * 100 : 0) : NaN;
    var shortDate = function(iso) { return formatDate(iso, true); };
    var periodLabel = rows.length ? shortDate(rows[0].date) + ' to ' + shortDate(rows[rows.length - 1].date) + ' | ' + rows.length + ' available days' : 'No available days';
    var riskLabel = !Number.isFinite(repeatRate) ? 'Unavailable' : repeatRate < 3 ? 'On Track' : repeatRate < 5 ? 'Watch' : 'Action';
    var card = function(tone, label, value, detail) {
      var iconTone = tone === 'green' ? 'teal' : tone === 'risk' ? 'red' : 'blue';
      return '<article class="kpi-card compact-kpi-card service-kpi-card ' + tone + '"><div class="kpi-topline"><span class="kpi-icon ' + iconTone + '">' + escapeHtml(label.slice(0, 1)) + '</span><span class="service-kpi-label kpi-label">' + label + '</span></div><strong class="service-kpi-value kpi-value">' + value + '</strong><span class="service-kpi-detail kpi-detail">' + detail + '</span></article>';
    };
    return '<div class="service-period-label">' + escapeHtml(periodLabel) + '</div><div class="service-kpi-grid">' +
      card('blue', rsaSeries.length === 1 ? rsaSeries[0].label + ' total' : 'Total RSA', formatNumber(totalRsa) + ' units', rsaStats.count + ' of ' + rows.length + ' days reported') +
      card('blue', 'Total B2W', formatNumber(totalB2w) + ' pcs', b2wStats.count + ' of ' + rows.length + ' days reported') +
      card('blue', resqSeries.length === 1 ? 'ResQ ' + resqSeries[0].label : 'Total ResQ', formatNumber(totalResq) + ' units', resqStats.count + ' of ' + rows.length + ' days reported') +
      card('green', 'Warranty first attendance', formatNumber(warrantyFirst), 'Cases in selected period') +
      card(riskLabel === 'On Track' ? 'green' : 'risk', 'Warranty repeat rate', (Number.isFinite(repeatRate) ? repeatRate.toFixed(1) + '%' : 'N/A'), riskLabel + ' | ' + (!Number.isFinite(repeatRate) ? 'awaiting data' : repeatRate < 3 ? 'below 3% repeat rate' : 'review repeat attendance')) + '</div>';
  }

  function serviceAvailableStats(rows, keys) {
    var available = (rows || []).map(function(row) {
      if (!keys.every(function(key) { return Number.isFinite(row[key]); })) return null;
      return { row: row, value: keys.reduce(function(sum, key) { return sum + row[key]; }, 0) };
    }).filter(Boolean);
    var total = available.length ? available.reduce(function(sum, item) { return sum + item.value; }, 0) : NaN;
    return {
      total: total,
      average: available.length ? total / available.length : NaN,
      count: available.length,
      latest: available.length ? available[available.length - 1] : null
    };
  }

  function dataQualityMarkup() {
    var issues = state.data.dataIssues || [];
    if (!issues.length) return '';
    var visible = issues.slice(0, 3).map(function(issue) { return '<li>' + escapeHtml(issue) + '</li>'; }).join('');
    var remainder = issues.length > 3 ? '<span class="data-quality-more">+' + (issues.length - 3) + ' more</span>' : '';
    return '<aside class="data-quality-banner" role="status" aria-label="Data quality checks"><div><strong>Data check: ' + issues.length + ' item' + (issues.length === 1 ? '' : 's') + '</strong><ul>' + visible + '</ul></div>' + remainder + '</aside>';
  }

  function renderServicesEnhanced() {
    var rows = rowsInRange(), latest = rows[rows.length - 1], rsaSeries = [{ key: 'rsaJumpstart', label: 'Jumpstart', className: 'jumpstart' }, { key: 'rsaTyrePatch', label: 'Tyre Patch', className: 'tyre-patch' }, { key: 'rsaFuel', label: 'Fuel', className: 'fuel' }], rsaSelection = ['all', 'rsaJumpstart', 'rsaTyrePatch', 'rsaFuel'].indexOf(state.rsaType) !== -1 ? state.rsaType : 'all', visibleRsaSeries = rsaSelection === 'all' ? rsaSeries : rsaSeries.filter(function(series) { return series.key === rsaSelection; }), resqSeries = resqSeriesList(state.resqState), rsaMax = rows.reduce(function(maximum, row) { return Math.max(maximum, visibleRsaSeries.reduce(function(sum, series) { return sum + numberValue(row[series.key]); }, 0)); }, 0), resqMax = rows.reduce(function(maximum, row) { return Math.max(maximum, resqSeries.reduce(function(sum, series) { return sum + numberValue(row[series.key]); }, 0)); }, 0), b2wMax = rows.reduce(function(maximum, row) { return Math.max(maximum, numberValue(row.b2w)); }, 0), rsaStats = serviceAvailableStats(rows, visibleRsaSeries.map(function(series) { return series.key; })), b2wStats = serviceAvailableStats(rows, ['b2w']), totalRsa = rsaStats.total, totalB2w = b2wStats.total, resqTotals = resqSeries.map(function(series) { return { label: series.label, value: rows.reduce(function(sum, row) { return sum + numberValue(row[series.key]); }, 0) }; }), totalResq = resqTotals.reduce(function(sum, series) { return sum + series.value; }, 0), topResq = resqTotals.slice().sort(function(a, b) { return b.value - a.value; })[0], latestWarrantyTotal = latest ? latest.warranty1st + latest.warranty2nd + latest.warranty3rd : 0, latestWarrantyRepeat = latest ? latest.warranty2nd + latest.warranty3rd : 0;
    var resqComplete = rows.every(function(row) { return resqSeries.every(function(series) { return Number.isFinite(row[series.key]); }); });
    if (!resqComplete) { totalResq = NaN; topResq = null; }
    var warrantyDate = state.warrantyDate && rows.some(function(row) { return row.date === state.warrantyDate; }) ? state.warrantyDate : (latest ? latest.date : '');
    state.warrantyDate = warrantyDate;
    var warrantyLatest = rows.find(function(row) { return row.date === warrantyDate; }) || latest;
    latestWarrantyTotal = warrantyLatest ? warrantyLatest.warranty1st + warrantyLatest.warranty2nd + warrantyLatest.warranty3rd : 0;
    latestWarrantyRepeat = warrantyLatest ? warrantyLatest.warranty2nd + warrantyLatest.warranty3rd : 0;
    var detailRows = rows.map(function(row) { return '<tr><td><strong>' + escapeHtml(formatDate(row.date, true)) + '</strong></td><td>' + formatNumber(row.rsaJumpstart) + '</td><td>' + formatNumber(row.rsaTyrePatch) + '</td><td>' + formatNumber(row.rsaFuel) + '</td><td><strong>' + formatNumber(row.rsaJumpstart + row.rsaTyrePatch + row.rsaFuel) + '</strong></td><td>' + formatNumber(row.b2w) + '</td><td>' + formatNumber(row.resQSelangor) + '</td><td>' + formatNumber(row.resQJb) + '</td><td>' + formatNumber(row.resQPahang) + '</td><td>' + formatNumber(row.resQPenang) + '</td><td><strong>' + formatNumber(row.resQ) + '</strong></td><td>' + formatNumber(row.warranty1st) + '</td><td>' + formatNumber(row.warranty2nd) + '</td><td>' + formatNumber(row.warranty3rd) + '</td></tr>'; }).join('');
    var detailPanel = '<details class="panel service-detail-panel"><summary>View daily detail table <span>' + rows.length + ' days</span></summary><div class="table-scroll"><table class="data-table service-detail-table"><thead><tr><th>Date</th><th>RSA jumpstart</th><th>RSA tyre patch</th><th>RSA fuel</th><th>Total RSA</th><th>B2W</th><th>ResQ Selangor</th><th>ResQ JB</th><th>ResQ Pahang</th><th>ResQ Penang</th><th>Total ResQ</th><th>Warranty 1st</th><th>Warranty 2nd</th><th>Warranty 3rd</th></tr></thead><tbody>' + (detailRows || '<tr><td colspan="14"><div class="empty-state">No service rows match this period.</div></td></tr>') + '</tbody></table></div></details>';
    var rsaFilter = serviceCycleControl('Filter RSA type', 'rsaType', rsaSelection, [{ value: 'all', label: 'All RSA types' }, { value: 'rsaJumpstart', label: 'Jumpstart' }, { value: 'rsaTyrePatch', label: 'Tyre Patch' }, { value: 'rsaFuel', label: 'Fuel' }]);
    var rsaSourceLabel = 'Manual daily input';
    var rsaCard = '<article class="service-chart-card panel" data-service-card-index="0">' + serviceHeader('RSA Breakdown', 'Daily · units · ' + rsaSourceLabel, rsaFilter + serviceFullscreenControl(0, 'RSA Breakdown')) + serviceChartKpis([{ label: rsaSelection === 'all' ? 'Total RSA' : visibleRsaSeries[0].label + ' total', value: formatNumber(totalRsa) + ' units' }, { label: 'Daily average', value: (Number.isFinite(rsaStats.average) ? rsaStats.average.toFixed(1) : 'N/A') + ' units' }]) + serviceStackedSvg(rows, visibleRsaSeries, rsaMax, 10, 'RSA breakdown by day', { enabled: true }) + serviceStackedLegend(visibleRsaSeries) + serviceFullscreenToolbar(0) + '</article>';
    var b2wCard = '<article class="service-chart-card panel" data-service-card-index="1">' + serviceHeader('B2W Daily Volume', 'Daily pcs · comparison with prior day', serviceControl('B2W chart grain', ['Daily', 'Weekly']) + serviceFullscreenControl(1, 'B2W Daily Volume')) + serviceChartKpis([{ label: 'Total B2W', value: formatNumber(totalB2w) + ' pcs' }, { label: 'Latest day', value: formatNumber(b2wStats.latest ? b2wStats.latest.value : NaN) + ' pcs' }]) + serviceColumnSvg(rows, 'b2w', b2wMax, 20, 'B2W volume by day') + '<div class="service-chart-legend"><span><i class="legend-box b2w"></i>Daily volume</span><span><i class="legend-outline latest"></i>Latest day</span></div>' + serviceFullscreenToolbar(1) + '</article>';
    var resqFilter = serviceCycleControl('Filter ResQ by state', 'resqState', state.resqState, [{ value: 'all', label: 'All states' }, { value: 'resQSelangor', label: 'Selangor' }, { value: 'resQJb', label: 'JB' }, { value: 'resQPahang', label: 'Pahang' }, { value: 'resQPenang', label: 'Penang' }]);
    var resqCard = '<article class="service-chart-card panel" data-service-card-index="2">' + serviceHeader('ResQ by State', 'Daily · units · comparison with prior day', resqFilter + serviceFullscreenControl(2, 'ResQ by State')) + serviceChartKpis([{ label: 'Total ResQ', value: formatNumber(totalResq) + ' units' }, { label: 'Top state', value: topResq ? topResq.label + ' · ' + formatNumber(topResq.value) : '—' }]) + serviceStackedSvg(rows, resqSeries, resqMax, 2, 'ResQ volume by state and day', { enabled: true }) + serviceStackedLegend(resqSeries) + serviceFullscreenToolbar(2) + '</article>';
    var warrantySourceLabel = HOSTED_MODE ? (state.warrantyApiAvailable ? 'Grafana · Plate_Number attendance' : 'Grafana unavailable') : 'Uploaded workbook';

    var warrantyCard = '<article class="service-chart-card panel" data-service-card-index="3">' + serviceHeader('Warranty Cases', 'Cases by attend - ' + serviceLongDayLabel(warrantyLatest && warrantyLatest.date) + ' · ' + warrantySourceLabel, warrantyDateControl(rows) + '<span class="warranty-pills"><span>1st</span><span>2nd</span><span>3rd</span></span>' + serviceFullscreenControl(3, 'Warranty Cases')) + serviceChartKpis([{ label: 'Selected-day total', value: formatNumber(latestWarrantyTotal) + ' cases' }, { label: 'Repeat rate', value: Number.isFinite(latestWarrantyTotal) ? (latestWarrantyTotal ? (latestWarrantyRepeat / latestWarrantyTotal * 100).toFixed(1) : '0.0') + '%' : 'N/A' }]) + '<div class="warranty-latest-note"><span aria-hidden="true">&#9633;</span><strong>Selected day: ' + escapeHtml(serviceLongDayLabel(warrantyLatest && warrantyLatest.date) + ' | Total cases ' + formatNumber(latestWarrantyTotal)) + '</strong></div>' + serviceWarrantySvg(warrantyLatest) + serviceFullscreenToolbar(3) + '</article>';
    return '<section class="services-dashboard">' + serviceSummaryMarkupClean(rows, visibleRsaSeries, resqSeries) + '<div class="service-chart-grid">' + rsaCard + b2wCard + resqCard + warrantyCard + '</div>' + detailPanel + '</section>';
  }

  function updateGlobalControls() {
    var first = firstDate(), last = lastDate(), from = document.getElementById('fromDate'), to = document.getElementById('toDate');
    var inputFirst = availableFirstDate();
    state.from = state.from || first; state.to = state.to || last;
    from.value = state.from; to.value = state.to; from.min = inputFirst; from.max = last; to.min = inputFirst; to.max = last;
    document.getElementById('filterEyebrow').textContent = 'Report window';
    document.getElementById('rangeLabel').textContent = formatRange(state.from, state.to);
    document.getElementById('loadStatus').textContent = state.data.sourceName.indexOf('Built-in') === 0 ? 'Preview' : 'Ready';
    var throughDate = lastDate() ? 'Data through ' + formatDate(lastDate(), true) : 'No reporting data';
    document.getElementById('loadMeta').textContent = throughDate + (state.data.loadedAt ? ' | loaded ' + formatDate(state.data.loadedAt, true) : '');
    document.querySelectorAll('[data-range]').forEach(function(button) {
      var active = button.getAttribute('data-range') === state.range;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    var summaryViews = ['special', 'summary-header', 'operations-summary', 'bgarage-summary', 'indonesia-summary'];
    var activeNavView = summaryViews.indexOf(state.view) !== -1 ? 'special' : state.view;
    document.querySelectorAll('.nav-item').forEach(function(button) { var active = button.getAttribute('data-view') === activeNavView; button.classList.toggle('is-active', active); button.setAttribute('aria-current', active ? 'page' : 'false'); });
    var summarySwitcher = document.getElementById('summaryReportSwitcher');
    var filterBar = document.querySelector('.filter-bar');
    var showSummarySwitcher = summaryViews.indexOf(state.view) !== -1;
    if (summarySwitcher) summarySwitcher.hidden = !showSummarySwitcher;
    if (filterBar) filterBar.classList.toggle('has-summary-switcher', showSummarySwitcher);
    document.querySelectorAll('[data-summary-view]').forEach(function(button) {
      var active = button.getAttribute('data-summary-view') === state.view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function bindViewEvents() {
    document.querySelectorAll('[data-toggle]').forEach(function(button) { button.addEventListener('click', function() {
      if (button.getAttribute('data-toggle') === 'b2c') state.showB2c = !state.showB2c;
      if (button.getAttribute('data-toggle') === 'b2b2c') state.showB2b2c = !state.showB2b2c;
      if (!state.showB2c && !state.showB2b2c) {
        if (button.getAttribute('data-toggle') === 'b2c') state.showB2b2c = true;
        else state.showB2c = true;
      }
      render();
    }); });
    document.querySelectorAll('[data-daily-detail-channel]').forEach(function(button) { button.addEventListener('click', function() { state.dailyDetailChannel = button.getAttribute('data-daily-detail-channel') || 'hq'; render(); }); });
    document.querySelectorAll('[data-special-channel]').forEach(function(button) { button.addEventListener('click', function() { state.specialChannel = button.getAttribute('data-special-channel') || 'all'; render(); }); });
    document.querySelectorAll('[data-b2c-state-summary-range]').forEach(function(button) { button.addEventListener('click', function() {
      state.b2cStateSummaryPreset = button.getAttribute('data-b2c-state-summary-range') || 'previous';
      state.summaryNetworkError = '';
      // A fixed Fri-Sun average and an arbitrary local date range cannot both
      // describe the same tier/detail tables. Selecting a shortcut gives the
      // shortcut priority and cleanly exits Weekend Average mode.
      if (state.weekendAverageActive) {
        state.weekendAverageActive = false;
        if (weekendSalesRequest) weekendSalesRequest.controller.abort();
        state.weekendSalesLoading = false;
        state.weekendSalesError = '';
      }
      render();
      scheduleSummaryNetworkSalesSync(0);
    }); });
    document.querySelectorAll('[data-weekly-ranking-previous]').forEach(function(button) { button.addEventListener('click', function() {
      state.weeklyRankingPreset = 'previous-week';
      resetWeeklyRankingSales();
      render();
      scheduleWeeklyRankingSalesSync(0);
    }); });
    document.querySelectorAll('[data-region-tier-focus]').forEach(function(button) { button.addEventListener('click', function() { state.regionTierFocus = button.getAttribute('data-region-tier-focus') || 'all'; render(); }); });
    document.querySelectorAll('[data-open-pitstops]').forEach(function(button) { button.addEventListener('click', function() { state.view = 'pitstops'; state.pitStatus = button.getAttribute('data-open-pitstops') || 'all'; state.selectedKey = ''; render(); }); });
    document.querySelectorAll('[data-view-link]').forEach(function(button) { button.addEventListener('click', function() { state.view = button.getAttribute('data-view-link'); state.serviceFullscreenIndex = -1; render(); }); });
    document.querySelectorAll('[data-pit-status]').forEach(function(button) { button.addEventListener('click', function() { state.pitStatus = button.getAttribute('data-pit-status'); state.selectedKey = ''; render(); }); });
    document.querySelectorAll('[data-cycle-filter]').forEach(function(button) { button.addEventListener('click', function() {
      var key = button.getAttribute('data-cycle-filter');
      var options = key === 'rsaType' ? ['all', 'rsaJumpstart', 'rsaTyrePatch', 'rsaFuel'] : ['all', 'resQSelangor', 'resQJb', 'resQPahang', 'resQPenang'];
      var currentIndex = options.indexOf(state[key]);
      state[key] = options[(currentIndex + 1 + options.length) % options.length];
      render();
    }); });
    document.querySelectorAll('[data-warranty-date]').forEach(function(select) { select.addEventListener('change', function() { state.warrantyDate = select.value; render(); }); });
    document.querySelectorAll('[data-b2w-input]').forEach(function(input) {
      input.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') { event.preventDefault(); saveManualServiceValues(); }
      });
      input.addEventListener('input', function() { markSummaryDirty('operations'); document.querySelectorAll('[data-save-service-values]').forEach(function(button) { button.classList.add('is-dirty'); button.textContent = 'Save changes'; }); });
    });
    document.querySelectorAll('[data-rsa-input]').forEach(function(input) {
      input.addEventListener('keydown', function(event) { if (event.key === 'Enter') { event.preventDefault(); saveManualServiceValues(); } });
      input.addEventListener('input', function() { markSummaryDirty('operations'); document.querySelectorAll('[data-save-service-values]').forEach(function(button) { button.classList.add('is-dirty'); button.textContent = 'Save changes'; }); });
    });
    document.querySelectorAll('[data-save-service-values]').forEach(function(button) { button.addEventListener('click', saveManualServiceValues); });
    document.querySelectorAll('[data-sync-b2w]').forEach(function(button) { button.addEventListener('click', syncB2wFromSharePoint); });
    document.querySelectorAll('[data-bgarage-manual-input]').forEach(function(input) {
      input.addEventListener('input', function() {
        markSummaryDirty('bgarage');
        updateManualBGarageCalculations();
        document.querySelectorAll('[data-save-bgarage-summary]').forEach(function(button) {
          button.classList.add('is-dirty');
          button.textContent = 'Save BGarage changes';
        });
      });
      if (input.hasAttribute('data-manual-money')) {
        input.addEventListener('focus', function() { input.select(); });
        input.addEventListener('blur', function() {
          normalizeManualMoneyInput(input);
          updateManualBGarageCalculations();
        });
      }
      input.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          normalizeManualMoneyInput(input);
          saveManualBGarageSummary();
        }
      });
    });
    document.querySelectorAll('[data-indonesia-manual-input]').forEach(function(input) {
      input.addEventListener('input', function() {
        markSummaryDirty('indonesia');
        updateManualIndonesiaCalculations(true);
        document.querySelectorAll('[data-save-indonesia-summary]').forEach(function(button) {
          button.classList.add('is-dirty');
          button.textContent = 'Save Indonesia changes';
        });
      });
      input.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') { event.preventDefault(); saveManualIndonesiaSummary(); }
      });
    });
    document.querySelectorAll('[data-indonesia-summary-date]').forEach(function(input) {
      input.addEventListener('change', function() { setIndonesiaSummaryDate(input.value); });
    });
    document.querySelectorAll('[data-bgarage-summary-date]').forEach(function(input) {
      input.addEventListener('change', function() { setBGarageSummaryDate(input.value); });
    });
    document.querySelectorAll('[data-save-bgarage-summary]').forEach(function(button) { button.addEventListener('click', saveManualBGarageSummary); });
    document.querySelectorAll('[data-save-indonesia-summary]').forEach(function(button) { button.addEventListener('click', saveManualIndonesiaSummary); });
    document.querySelectorAll('[data-pit-channel]').forEach(function(button) { button.addEventListener('click', function() { var channel = button.getAttribute('data-pit-channel'), current = Array.isArray(state.pitChannels) ? state.pitChannels.slice() : ['HQ', 'WH']; if (channel === 'all') current = ['HQ', 'BP', 'WH', 'HQC', 'BPC']; else if (current.indexOf(channel) !== -1) { if (current.length === 1) return; current = current.filter(function(item) { return item !== channel; }); } else current.push(channel); state.pitChannels = current; render(); }); });
    document.querySelectorAll('[data-pit-region]').forEach(function(select) { select.addEventListener('change', function() { state.pitRegion = select.value; render(); }); });
    document.querySelectorAll('[data-pit-state]').forEach(function(select) { select.addEventListener('change', function() { state.pitState = select.value; render(); }); });
    document.querySelectorAll('[data-pit-tier]').forEach(function(select) { select.addEventListener('change', function() { state.pitTier = select.value; render(); }); });
    document.querySelectorAll('[data-pit-status-filter]').forEach(function(select) { select.addEventListener('change', function() { state.pitStatus = select.value; render(); }); });
    document.querySelectorAll('[data-pit-sort]').forEach(function(select) { select.addEventListener('change', function() { state.pitArrange = select.value; render(); }); });
    document.querySelectorAll('[data-pit-reset]').forEach(function(button) { button.addEventListener('click', function() { state.pitStatus = 'all'; state.pitChannels = ['HQ', 'WH']; state.pitRegion = 'all'; state.pitState = 'all'; state.pitTier = 'all'; state.pitArrange = 'state'; state.pitSearch = ''; state.selectedKey = ''; render(); }); });
    document.querySelectorAll('[data-pit-search]').forEach(function(input) { input.addEventListener('input', function() { state.pitSearch = input.value; render(); var field = document.querySelector('[data-pit-search]'); if (field) { field.focus(); field.setSelectionRange(state.pitSearch.length, state.pitSearch.length); } }); });
    document.querySelectorAll('[data-pitstop-key]').forEach(function(row) { row.addEventListener('click', function() { state.selectedKey = row.getAttribute('data-pitstop-key'); render(); }); });
    document.querySelectorAll('[data-close-detail]').forEach(function(button) { button.addEventListener('click', function() { state.selectedKey = ''; render(); }); });
    document.querySelectorAll('[data-bgarage-status]').forEach(function(button) { button.addEventListener('click', function() { state.bgarageStatus = button.getAttribute('data-bgarage-status') || 'all'; render(); }); });
    document.querySelectorAll('[data-bgarage-search]').forEach(function(input) { input.addEventListener('input', function() { state.bgarageSearch = input.value; render(); var field = document.querySelector('[data-bgarage-search]'); if (field) { field.focus(); field.setSelectionRange(state.bgarageSearch.length, state.bgarageSearch.length); } }); });
    document.querySelectorAll('[data-service-fullscreen]').forEach(function(button) { button.addEventListener('click', function() { state.serviceFullscreenIndex = Number(button.getAttribute('data-service-fullscreen')); render(); }); });
    document.querySelectorAll('[data-service-nav]').forEach(function(button) { button.addEventListener('click', function() { moveServiceFullscreen(button.getAttribute('data-service-nav') === 'next' ? 1 : -1); }); });
    document.querySelectorAll('[data-service-exit]').forEach(function(button) { button.addEventListener('click', function() { state.serviceFullscreenIndex = -1; render(); }); });
    document.querySelectorAll('[data-copy-email-summary]').forEach(function(button) { button.addEventListener('click', copyEmailSummary); });
    document.querySelectorAll('[data-refresh-summary]').forEach(function(button) { button.addEventListener('click', refreshDashboard); });
    document.querySelectorAll('[data-email-ranking-toggle]').forEach(function(button) { button.addEventListener('click', function() { state.emailRankingCollapsed = !state.emailRankingCollapsed; render(); }); });
    document.querySelectorAll('[data-email-warehouse-toggle]').forEach(function(button) { button.addEventListener('click', function() { state.emailWarehouseHidden = !state.emailWarehouseHidden; render(); }); });
    document.querySelectorAll('[data-weekend-average-toggle]').forEach(function(button) { button.addEventListener('click', function() {
      state.weekendAverageActive = !state.weekendAverageActive;
      if (state.weekendAverageActive) {
        state.b2cStateSummaryPreset = 'report';
        resetSummaryNetworkSales();
      }
      if (!state.weekendAverageActive) {
        if (weekendSalesRequest) weekendSalesRequest.controller.abort();
        state.weekendSalesLoading = false;
        state.weekendSalesError = '';
      }
      render();
      if (state.weekendAverageActive) scheduleWeekendSalesSync(0);
    }); });
  }

  function prepareCopiedBGarageTables(root, regularBody) {
    var columnWidths = [140, 116, 117, 104, 88, 112, 120, 116, 137];
    var tableWidth = columnWidths.reduce(function(total, width) { return total + width; }, 0);
    root.querySelectorAll('.email-bgarage-table').forEach(function(table) {
      var isSalesPerformanceTable = /Daily Sales Target/i.test(table.textContent || '');
      var existing = table.querySelector('colgroup');
      if (existing) existing.remove();
      var colgroup = document.createElement('colgroup');
      columnWidths.forEach(function(width) {
        var column = document.createElement('col');
        column.setAttribute('width', String(width));
        column.style.width = width + 'px';
        colgroup.appendChild(column);
      });
      table.insertBefore(colgroup, table.firstChild);
      table.setAttribute('width', String(tableWidth));
      table.setAttribute('cellspacing', '0');
      table.setAttribute('cellpadding', '0');
      table.style.width = tableWidth + 'px';
      table.style.minWidth = tableWidth + 'px';
      table.style.maxWidth = tableWidth + 'px';
      table.style.tableLayout = 'fixed';
      table.style.borderCollapse = 'collapse';
      table.style.marginLeft = '0';
      table.style.marginRight = '0';
      table.style.setProperty('mso-table-lspace', '0pt');
      table.style.setProperty('mso-table-rspace', '0pt');
      Array.from(table.rows).forEach(function(row) {
        Array.from(row.cells).forEach(function(cell, index) {
          var width = columnWidths[index] || 120;
          cell.setAttribute('width', String(width));
          cell.style.width = width + 'px';
          cell.style.padding = '5px 7px';
          cell.style.border = '1px solid #b7b7b7';
          cell.style.verticalAlign = 'middle';
          cell.style.lineHeight = '1.15';
          cell.style.textAlign = index === 0 ? 'left' : 'center';
          cell.style.wordBreak = 'normal';
          cell.style.overflowWrap = 'normal';
          cell.style.whiteSpace = index === 0 || cell.tagName === 'TD' ? 'nowrap' : 'normal';
        });
      });
      // Editable money cells contain an RM prefix and a separate input. Even
      // after the input is converted to text, Outlook can preserve that inner
      // flex layout and align the amount to the left. Flatten each monetary
      // column into one full-width, centred text value for clipboard output.
      if (isSalesPerformanceTable) {
        Array.from(table.tBodies).forEach(function(body) {
          Array.from(body.rows).forEach(function(row) {
            if (row.cells.length < columnWidths.length) return;
            [1, 2, 6, 7, 8].forEach(function(index) {
              var cell = row.cells[index];
              if (!cell) return;
              var value = String(cell.textContent || '').replace(/\s+/g, ' ').trim();
              if (!value) return;
              value = value
                .replace(/^RM\s*-$/i, 'RM -')
                .replace(/^-\s*RM\s*/i, '-RM')
                .replace(/^RM\s*/i, 'RM');
              while (cell.firstChild) cell.removeChild(cell.firstChild);
              var amount = document.createElement('span');
              amount.textContent = value;
              amount.style.display = 'block';
              amount.style.width = '100%';
              amount.style.margin = '0';
              amount.style.padding = '0';
              amount.style.fontWeight = regularBody ? '400' : '700';
              amount.style.textAlign = 'center';
              amount.style.whiteSpace = 'nowrap';
              cell.appendChild(amount);
              cell.style.textAlign = 'center';
            });
          });
        });
      }
      var wrapper = table.parentElement;
      if (wrapper && wrapper.classList.contains('email-table-scroll')) {
        wrapper.style.width = tableWidth + 'px';
        wrapper.style.maxWidth = 'none';
        wrapper.style.overflow = 'visible';
      }
    });
  }

  function prepareCopiedStatusDots(root) {
    var colors = { green: '#43c98d', yellow: '#edb72d', red: '#e63f56' };
    var glyphs = { green: String.fromCodePoint(128994), yellow: String.fromCodePoint(128993), red: String.fromCodePoint(128308) };
    root.querySelectorAll('.email-status-dot').forEach(function(dot) {
      var status = dot.classList.contains('green') ? 'green' : dot.classList.contains('yellow') ? 'yellow' : 'red';
      var circle = document.createElement('font'), color = colors[status], inLegend = !!dot.closest('.email-legend');
      circle.className = 'email-status-circle ' + status;
      circle.setAttribute('color', color);
      circle.setAttribute('face', 'Segoe UI Emoji');
      circle.setAttribute('role', 'img');
      circle.setAttribute('aria-label', status === 'green' ? 'Green' : status === 'yellow' ? 'Yellow' : 'Red');
      circle.textContent = glyphs[status];
      circle.style.setProperty('display', 'inline-block', 'important');
      circle.style.setProperty('width', inLegend ? '20px' : '16px', 'important');
      circle.style.setProperty('color', color, 'important');
      circle.style.setProperty('font-family', 'Segoe UI Emoji, Arial, sans-serif', 'important');
      circle.style.setProperty('font-size', inLegend ? '16px' : '14px', 'important');
      circle.style.setProperty('font-weight', '400', 'important');
      circle.style.setProperty('line-height', inLegend ? '20px' : '16px', 'important');
      circle.style.setProperty('text-align', 'center', 'important');
      circle.style.setProperty('vertical-align', 'middle', 'important');
      dot.replaceWith(circle);
    });
  }

  async function copyEmailSummary(options) {
    var blockedReason = summaryCopyBlockReason(false);
    if (blockedReason) { showToast(blockedReason); return; }
    var snapshotHost = createSummarySnapshotHost();
    var source = snapshotHost && snapshotHost.querySelector('#emailSummaryContent');
    if (!source) { if (snapshotHost) snapshotHost.remove(); showToast('The report snapshot is still being prepared.'); return; }
    var copyVariant = source.getAttribute('data-copy-variant');
    var summaryHeaderCopy = copyVariant === 'summary-header' || state.view === 'summary-header' || !!source.closest('.summary-header-view');
    var bgarageSummaryCopy = copyVariant === 'bgarage-summary' || state.view === 'bgarage-summary' || source.getAttribute('data-manual-view') === 'bgarage';
    var indonesiaSummaryCopy = !bgarageSummaryCopy && (copyVariant === 'indonesia-summary' || state.view === 'indonesia-summary' || source.getAttribute('data-manual-view') === 'indonesia' || !!source.closest('.indonesia-summary-view'));
    var operationsSummaryCopy = !indonesiaSummaryCopy && !bgarageSummaryCopy && (copyVariant === 'operations-summary' || state.view === 'operations-summary' || !!source.closest('.operations-summary-view'));
    var fullSummaryCopy = !summaryHeaderCopy && !operationsSummaryCopy && !bgarageSummaryCopy && !indonesiaSummaryCopy;
    var clone = source.cloneNode(true), originals = [source].concat(Array.from(source.querySelectorAll('*'))), copies = [clone].concat(Array.from(clone.querySelectorAll('*')));
    var styleProperties = ['background-color', 'border', 'border-collapse', 'border-color', 'border-radius', 'border-spacing', 'border-style', 'border-width', 'box-sizing', 'box-shadow', 'caption-side', 'color', 'display', 'font-family', 'font-size', 'font-style', 'font-variant-numeric', 'font-weight', 'height', 'letter-spacing', 'line-height', 'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'max-height', 'max-width', 'min-height', 'min-width', 'overflow-wrap', 'padding', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'table-layout', 'text-align', 'text-decoration', 'text-indent', 'text-transform', 'vertical-align', 'white-space', 'word-break', 'word-spacing', 'width'];
    originals.forEach(function(node, index) {
      var target = copies[index], computed = window.getComputedStyle(node);
      styleProperties.forEach(function(property) { var value = computed.getPropertyValue(property); if (value) target.style.setProperty(property, value); });
    });
    // Outlook can strip hidden/display:none when saving a draft. Do not export
    // collapsed sections at all, so reopening the email cannot reveal them.
    clone.querySelectorAll('[hidden]').forEach(function(element) { element.remove(); });
    // The report container is only an on-screen card. Strip that outer frame
    // from clipboard HTML while preserving the borders inside every table.
    clone.style.border = '0';
    clone.style.outline = '0';
    clone.style.borderRadius = '0';
    clone.style.boxShadow = 'none';
    clone.style.backgroundColor = '#ffffff';
    clone.style.padding = '0';
    clone.style.margin = '0';
    clone.style.width = 'auto';
    clone.style.maxWidth = 'none';
    // The application shell is intentionally bold, but email-ready reports
    // use normal body copy. Set the hierarchy explicitly because Outlook can
    // otherwise inherit the shell's 700 weight when pasted.
    clone.style.fontWeight = '400';
    clone.querySelectorAll('p').forEach(function(paragraph) { paragraph.style.fontWeight = '400'; });
    clone.querySelectorAll('.email-major-lead, .email-legend').forEach(function(element) { element.style.fontWeight = operationsSummaryCopy ? '400' : '700'; });
    clone.querySelectorAll('.email-section-lead').forEach(function(element) { element.style.fontWeight = '400'; });
    clone.querySelectorAll('th, td').forEach(function(cell) { cell.style.fontWeight = (summaryHeaderCopy || operationsSummaryCopy || bgarageSummaryCopy || indonesiaSummaryCopy) && cell.tagName === 'TD' ? '400' : '700'; });
    clone.querySelectorAll('strong').forEach(function(element) { element.style.fontWeight = '700'; });
    if (fullSummaryCopy) {
      clone.querySelectorAll('.email-summary-document .email-table').forEach(function(table) {
        table.querySelectorAll('thead th, .email-column-row th, .email-state-title th').forEach(function(cell) {
          cell.style.setProperty('font-weight', '700', 'important');
        });
        table.querySelectorAll('tbody td').forEach(function(cell) {
          cell.style.setProperty('font-weight', '400', 'important');
          cell.querySelectorAll('*').forEach(function(child) { child.style.setProperty('font-weight', '400', 'important'); });
        });
        table.querySelectorAll('tbody td strong, tbody .email-total-row > td, tbody .email-total-row > td *, tbody td.email-tier-total, tbody td.email-tier-total *').forEach(function(cell) {
          cell.style.setProperty('font-weight', '700', 'important');
        });
      });
    }
    if (summaryHeaderCopy) {
      // Outlook does not reliably preserve class-based or inherited styles.
      // Make the compact header report entirely self-contained with inline
      // formatting so its pasted result matches the on-screen email preview.
      clone.style.fontFamily = 'Arial, Helvetica, sans-serif';
      clone.style.fontSize = '16px';
      clone.style.lineHeight = '1.35';
      clone.style.color = '#000000';
      clone.style.fontWeight = '400';
      clone.style.width = '646px';
      clone.style.maxWidth = '646px';

      function wrapNormalText(element) {
        if (!element) return;
        Array.from(element.childNodes).forEach(function(node) {
          if (node.nodeType !== 3 || !String(node.nodeValue || '').trim()) return;
          var text = document.createElement('span');
          text.textContent = node.nodeValue;
          text.style.setProperty('font-weight', '400', 'important');
          text.style.color = '#000000';
          node.parentNode.replaceChild(text, node);
        });
      }

      var greeting = clone.querySelector('.email-summary-greeting');
      if (greeting) {
        greeting.style.fontFamily = 'Arial, Helvetica, sans-serif';
        greeting.style.fontSize = '16px';
        greeting.style.lineHeight = '1.35';
        greeting.style.fontWeight = '400';
        greeting.style.margin = '0 0 28px 0';
        greeting.style.color = '#000000';
        wrapNormalText(greeting);
      }
      var intro = clone.querySelector('.email-summary-intro');
      if (intro) {
        intro.style.fontFamily = 'Arial, Helvetica, sans-serif';
        intro.style.fontSize = '16px';
        intro.style.lineHeight = '1.45';
        intro.style.fontWeight = '400';
        intro.style.margin = '0 0 24px 0';
        intro.style.color = '#000000';
        intro.style.width = '646px';
        intro.style.maxWidth = '646px';
        intro.style.whiteSpace = 'nowrap';
        wrapNormalText(intro);
      }
      clone.querySelectorAll('.email-summary-greeting strong, .email-summary-intro strong').forEach(function(element) {
        element.style.fontWeight = '700';
        element.style.color = '#000000';
      });

      var salesTable = clone.querySelector('.email-sales-table');
      if (salesTable) {
        salesTable.style.borderCollapse = 'collapse';
        salesTable.style.borderSpacing = '0';
        salesTable.style.tableLayout = 'fixed';
        salesTable.style.width = '646px';
        salesTable.style.maxWidth = '646px';
        salesTable.style.margin = '0';
        salesTable.setAttribute('width', '646');
        salesTable.setAttribute('cellpadding', '0');
        salesTable.setAttribute('cellspacing', '0');
        salesTable.setAttribute('border', '0');

        var columnWidths = ['122px', '125px', '150px', '129px', '120px'];
        var existingColumnGroup = salesTable.querySelector('colgroup');
        if (existingColumnGroup) existingColumnGroup.remove();
        var columnGroup = document.createElement('colgroup');
        columnWidths.forEach(function(width) {
          var column = document.createElement('col');
          column.setAttribute('width', String(parseInt(width, 10)));
          column.style.width = width;
          columnGroup.appendChild(column);
        });
        salesTable.insertBefore(columnGroup, salesTable.firstChild);
        salesTable.querySelectorAll('tr').forEach(function(row) {
          Array.from(row.children).forEach(function(cell, index) {
            var width = columnWidths[index] || 'auto';
            cell.style.width = width;
            if (width !== 'auto') cell.setAttribute('width', String(parseInt(width, 10)));
            cell.style.boxSizing = 'border-box';
            cell.style.border = '1px solid #b7b7b7';
            cell.style.padding = '5px 7px';
            cell.style.fontFamily = 'Arial, Helvetica, sans-serif';
            cell.style.fontSize = '14px';
            cell.style.lineHeight = '1.15';
            cell.style.verticalAlign = 'middle';
            cell.style.color = '#000000';
            cell.style.textAlign = index === 0 ? 'left' : 'center';
            cell.style.whiteSpace = 'nowrap';
            cell.style.overflowWrap = 'normal';
          });
        });
        salesTable.querySelectorAll('th').forEach(function(cell) {
          cell.style.backgroundColor = '#cfe5d5';
          cell.style.fontWeight = '700';
          cell.style.whiteSpace = 'nowrap';
          cell.style.height = '30px';
        });
        salesTable.querySelectorAll('tbody td').forEach(function(cell) {
          cell.style.backgroundColor = '#ffffff';
          cell.style.setProperty('font-weight', '400', 'important');
          cell.style.height = '29px';
          cell.querySelectorAll('*').forEach(function(child) { child.style.setProperty('font-weight', '400', 'important'); });
          var cellText = document.createElement('span');
          cellText.textContent = String(cell.textContent || '').trim();
          cellText.style.setProperty('font-weight', '400', 'important');
          cellText.style.color = '#000000';
          cell.textContent = '';
          cell.appendChild(cellText);
        });
        salesTable.querySelectorAll('.email-movement').forEach(function(cell) {
          cell.style.fontWeight = '400';
          var isDecrease = cell.classList.contains('decrease');
          cell.style.setProperty('color', '#000000', 'important');
          if (isDecrease) {
            // Outlook reliably preserves the legacy table-cell bgcolor
            // attribute even when it strips pasted CSS backgrounds.
            cell.setAttribute('bgcolor', '#f8d7da');
            cell.style.setProperty('background-color', '#f8d7da', 'important');
            // Keep a legacy FONT wrapper so Outlook preserves black text while
            // retaining the cell's light-red warning background.
            var movementText = document.createElement('font');
            movementText.setAttribute('color', '#000000');
            movementText.textContent = String(cell.textContent || '').trim();
            movementText.style.setProperty('color', '#000000', 'important');
            movementText.style.setProperty('font-weight', '400', 'important');
            movementText.style.setProperty('mso-style-textfill-fill-color', '#000000');
            movementText.style.setProperty('mso-style-textfill-fill-alpha', '100%');
            cell.textContent = '';
            cell.appendChild(movementText);
          }
        });
      }
    }
    if (operationsSummaryCopy) {
      // Operations Summary uses a compact Outlook-safe layout: only the
      // explicit strong labels and table headers are bold.
      clone.style.fontFamily = 'Arial, Helvetica, sans-serif';
      clone.style.fontSize = '14px';
      clone.style.lineHeight = '1.35';
      clone.style.color = '#000000';
      clone.style.fontWeight = '400';
      var operationsMaxWidth = Object.keys(OPERATIONS_TABLE_COLUMN_WIDTHS).reduce(function(maxWidth, key) { return Math.max(maxWidth, operationsTableTotalWidth(key)); }, 0);
      clone.style.width = operationsMaxWidth + 'px';
      clone.style.maxWidth = operationsMaxWidth + 'px';

      var firstOperationsLead = clone.querySelector('.email-section-lead');
      var operationsHeading = clone.querySelector('.email-editable-heading');
      if (operationsHeading) {
        operationsHeading.style.display = 'block';
        operationsHeading.style.margin = '0 0 12px 0';
        operationsHeading.style.padding = '0';
      }
      clone.querySelectorAll('.email-section-lead').forEach(function(lead) {
        lead.style.fontFamily = 'Arial, Helvetica, sans-serif';
        lead.style.fontSize = '14px';
        lead.style.lineHeight = '1.35';
        lead.style.fontWeight = '400';
        lead.style.color = '#000000';
        lead.style.margin = lead === firstOperationsLead ? '0' : '18px 0 12px 0';
      });
      clone.querySelectorAll('.email-section-lead strong').forEach(function(element) {
        element.style.fontWeight = '700';
        element.style.color = '#000000';
      });

      clone.querySelectorAll('.operations-summary-document table.email-table').forEach(function(table, tableIndex) {
        var fallbackKeys = ['rsa', 'resq', 'warranty'], tableKey = table.getAttribute('data-operations-table') || fallbackKeys[tableIndex] || 'rsa';
        var widths = operationsTableWidths(tableKey).map(function(width) { return width + 'px'; });
        var totalWidth = widths.reduce(function(total, width) { return total + parseInt(width, 10); }, 0);
        table.style.borderCollapse = 'collapse';
        table.style.borderSpacing = '0';
        table.style.tableLayout = 'fixed';
        table.style.width = totalWidth + 'px';
        table.style.maxWidth = totalWidth + 'px';
        table.style.margin = '0 0 18px 0';
        table.setAttribute('width', String(totalWidth));
        table.setAttribute('cellpadding', '0');
        table.setAttribute('cellspacing', '0');
        table.setAttribute('border', '0');

        var existingColumnGroup = table.querySelector('colgroup');
        if (existingColumnGroup) existingColumnGroup.remove();
        var columnGroup = document.createElement('colgroup');
        widths.forEach(function(width) {
          var column = document.createElement('col');
          column.setAttribute('width', String(parseInt(width, 10)));
          column.style.width = width;
          columnGroup.appendChild(column);
        });
        table.insertBefore(columnGroup, table.firstChild);

        table.querySelectorAll('tr').forEach(function(row) {
          Array.from(row.children).forEach(function(cell, index) {
            var width = widths[index] || 'auto';
            cell.style.width = width;
            if (width !== 'auto') cell.setAttribute('width', String(parseInt(width, 10)));
            cell.style.boxSizing = 'border-box';
            cell.style.border = '1px solid #b7b7b7';
            cell.style.padding = '4px 5px';
            cell.style.fontFamily = 'Arial, Helvetica, sans-serif';
            cell.style.fontSize = '12px';
            cell.style.lineHeight = '1.15';
            cell.style.verticalAlign = 'middle';
            cell.style.color = '#000000';
            cell.style.textAlign = index === 0 ? 'left' : 'center';
            cell.style.overflowWrap = 'normal';
            cell.style.wordBreak = 'normal';
            cell.style.whiteSpace = cell.tagName === 'TH' ? 'normal' : 'nowrap';
          });
        });
        table.querySelectorAll('thead th').forEach(function(cell) {
          cell.style.backgroundColor = '#cfe5d5';
          cell.style.fontWeight = '700';
          cell.style.height = '38px';
        });
        table.querySelectorAll('tbody td').forEach(function(cell) {
          cell.style.backgroundColor = '#ffffff';
          cell.style.setProperty('font-weight', '400', 'important');
          cell.style.height = '22px';
          cell.querySelectorAll('*').forEach(function(child) { child.style.setProperty('font-weight', '400', 'important'); });
          cell.querySelectorAll('strong').forEach(function(element) {
            element.replaceWith(document.createTextNode(element.textContent || ''));
          });
        });
      });
    }
    clone.querySelectorAll('[data-b2w-input], [data-rsa-input], .manual-report-input').forEach(function(input) {
      var value = String(input.value || '').trim(), text = document.createElement('span');
      text.textContent = value;
      text.style.fontWeight = (fullSummaryCopy || operationsSummaryCopy || bgarageSummaryCopy || indonesiaSummaryCopy) ? '400' : '700';
      text.style.display = 'inline-block';
      text.style.minWidth = '36px';
      text.style.textAlign = 'center';
      input.replaceWith(text);
    });
    clone.querySelectorAll('[data-copy-exclude]').forEach(function(element) { element.remove(); });
    // The local B2C date controls are screen-only. Once removed, convert the
    // remaining heading row back to a normal block for Outlook's Word engine.
    clone.querySelectorAll('.email-local-summary-heading').forEach(function(heading) {
      heading.style.display = 'block';
      heading.style.width = 'auto';
      heading.style.margin = '34px 0 12px 0';
      var lead = heading.querySelector('.email-section-lead');
      if (lead) lead.style.margin = '0';
    });
    prepareCopiedBGarageTables(clone, bgarageSummaryCopy || indonesiaSummaryCopy || fullSummaryCopy);
    if (bgarageSummaryCopy) {
      // BGarage has a dedicated Outlook format: section labels, outlet names,
      // headers, and totals are bold; all other values remain regular.
      clone.style.fontFamily = 'Arial, Helvetica, sans-serif';
      clone.style.fontSize = '14px';
      clone.style.lineHeight = '1.35';
      clone.style.color = '#000000';
      clone.style.fontWeight = '400';
      clone.style.width = '1050px';
      clone.style.maxWidth = '1050px';

      clone.querySelectorAll('.manual-section-heading').forEach(function(heading) {
        heading.style.display = 'block';
        heading.style.margin = '0 0 18px 0';
        heading.style.padding = '0';
      });
      clone.querySelectorAll('p').forEach(function(paragraph) {
        var text = String(paragraph.textContent || '').trim();
        paragraph.style.fontFamily = 'Arial, Helvetica, sans-serif';
        paragraph.style.fontSize = '14px';
        paragraph.style.lineHeight = '1.35';
        paragraph.style.color = '#000000';
        paragraph.style.fontWeight = '400';
        paragraph.style.margin = '0';
        if (paragraph.classList.contains('email-major-lead')) {
          paragraph.style.fontWeight = '700';
          paragraph.style.margin = '0';
        } else if (text.indexOf('Reporting date:') === 0) {
          paragraph.style.margin = '0 0 32px 0';
        } else if (text === 'Status classification:' || text.indexOf('A. Sales Performance') === 0 || text.indexOf('B. Conversion & Intake Performance') === 0) {
          paragraph.style.fontWeight = '700';
          paragraph.style.margin = text === 'Status classification:' ? '0 0 4px 0' : '0 0 10px 0';
        }
      });
      clone.querySelectorAll('.manual-section-heading strong, p > strong').forEach(function(element) {
        element.style.setProperty('font-weight', '700', 'important');
        element.style.color = '#000000';
      });

      var statusColors = { achieved: '#c7ecd3', near: '#f7d326', below: '#f7dada', critical: '#f7dada', na: '#eceff1' };
      clone.querySelectorAll('.email-classification').forEach(function(table) {
        var classificationWidths = ['252px', '236px'];
        table.style.width = '488px';
        table.style.maxWidth = '488px';
        table.style.tableLayout = 'fixed';
        table.style.borderCollapse = 'collapse';
        table.style.margin = '0 0 22px 0';
        table.setAttribute('width', '488');
        table.querySelectorAll('tr').forEach(function(row) {
          Array.from(row.cells).forEach(function(cell, index) {
            cell.style.width = classificationWidths[index];
            cell.setAttribute('width', String(parseInt(classificationWidths[index], 10)));
            cell.style.padding = '4px 6px';
            cell.style.border = '1px solid #b7b7b7';
            cell.style.fontFamily = 'Arial, Helvetica, sans-serif';
            cell.style.fontSize = '14px';
            cell.style.lineHeight = '1.15';
            cell.style.color = '#000000';
            cell.style.textAlign = 'center';
            cell.style.fontWeight = cell.tagName === 'TH' ? '700' : '400';
          });
        });
        table.querySelectorAll('thead th').forEach(function(cell) {
          cell.setAttribute('bgcolor', '#cfe5d5');
          cell.style.backgroundColor = '#cfe5d5';
        });
      });
      clone.querySelectorAll('.email-performance').forEach(function(cell) {
        var className = Object.keys(statusColors).find(function(name) { return cell.classList.contains(name); });
        if (!className) return;
        cell.setAttribute('bgcolor', statusColors[className]);
        cell.style.backgroundColor = statusColors[className];
      });
      clone.querySelectorAll('.email-bgarage-table').forEach(function(table, tableIndex) {
        table.style.margin = tableIndex === 0 ? '0 0 22px 0' : '0';
        table.querySelectorAll('thead th').forEach(function(cell) {
          cell.setAttribute('bgcolor', '#cfe5d5');
          cell.style.backgroundColor = '#cfe5d5';
          cell.style.fontWeight = '700';
          cell.style.fontSize = '14px';
        });
        table.querySelectorAll('tbody tr:not(.email-total-row) td').forEach(function(cell) {
          var isOutlet = cell.cellIndex === 0;
          if (!cell.classList.contains('email-performance')) {
            cell.setAttribute('bgcolor', '#ffffff');
            cell.style.backgroundColor = '#ffffff';
          }
          cell.style.setProperty('font-weight', isOutlet ? '700' : '400', 'important');
          cell.style.fontSize = '14px';
          cell.querySelectorAll('*').forEach(function(child) { child.style.setProperty('font-weight', isOutlet ? '700' : '400', 'important'); });
        });
        table.querySelectorAll('tbody .email-total-row td').forEach(function(cell) {
          cell.setAttribute('bgcolor', '#cfe5d5');
          cell.style.backgroundColor = '#cfe5d5';
          cell.style.setProperty('font-weight', '700', 'important');
          cell.style.fontSize = '14px';
          cell.querySelectorAll('*').forEach(function(child) { child.style.setProperty('font-weight', '700', 'important'); });
        });
        table.querySelectorAll('tbody .email-total-row .email-performance').forEach(function(cell) {
          var className = Object.keys(statusColors).find(function(name) { return cell.classList.contains(name); });
          if (!className) return;
          cell.setAttribute('bgcolor', statusColors[className]);
          cell.style.backgroundColor = statusColors[className];
        });
      });
    }
    if (indonesiaSummaryCopy) {
      // Indonesia uses a separate Outlook layout with grouped sales headers.
      // Apply every visual property inline because Outlook's Word renderer
      // does not consistently retain the dashboard's CSS cascade on paste.
      var indonesiaWidths = [130, 130, 75, 100, 87, 88, 80, 82, 82, 88, 80, 86, 82, 88, 82];
      var indonesiaTableWidth = indonesiaWidths.reduce(function(total, width) { return total + width; }, 0);
      clone.style.fontFamily = 'Arial, Helvetica, sans-serif';
      clone.style.fontSize = '14px';
      clone.style.lineHeight = '1.35';
      clone.style.color = '#000000';
      clone.style.fontWeight = '400';
      clone.style.width = indonesiaTableWidth + 'px';
      clone.style.maxWidth = indonesiaTableWidth + 'px';

      clone.querySelectorAll('.manual-section-heading').forEach(function(heading) {
        heading.style.display = 'block';
        heading.style.margin = '0 0 18px 0';
        heading.style.padding = '0';
      });
      clone.querySelectorAll('p').forEach(function(paragraph) {
        var text = String(paragraph.textContent || '').trim();
        paragraph.style.fontFamily = 'Arial, Helvetica, sans-serif';
        paragraph.style.fontSize = '14px';
        paragraph.style.lineHeight = '1.35';
        paragraph.style.color = '#000000';
        paragraph.style.fontWeight = '400';
        paragraph.style.margin = '0';
        if (paragraph.classList.contains('email-major-lead')) {
          paragraph.style.fontWeight = '700';
          paragraph.style.margin = '0';
        } else if (text.indexOf('Reporting date:') === 0) {
          paragraph.style.margin = '0 0 38px 0';
        } else if (text === 'Daily Performance Summary' || text.indexOf('Cumulative Sales ') === 0) {
          paragraph.style.fontWeight = '700';
          paragraph.style.margin = '0 0 2px 0';
        }
      });
      clone.querySelectorAll('.manual-section-heading strong, p > strong').forEach(function(element) {
        element.style.setProperty('font-weight', '700', 'important');
        element.style.color = '#000000';
      });

      clone.querySelectorAll('.manual-indonesia-table').forEach(function(table, tableIndex) {
        var existingColumnGroup = table.querySelector('colgroup');
        if (existingColumnGroup) existingColumnGroup.remove();
        var columnGroup = document.createElement('colgroup');
        indonesiaWidths.forEach(function(width) {
          var column = document.createElement('col');
          column.setAttribute('width', String(width));
          column.style.width = width + 'px';
          columnGroup.appendChild(column);
        });
        table.insertBefore(columnGroup, table.firstChild);
        table.setAttribute('width', String(indonesiaTableWidth));
        table.setAttribute('cellpadding', '0');
        table.setAttribute('cellspacing', '0');
        table.setAttribute('border', '0');
        table.style.width = indonesiaTableWidth + 'px';
        table.style.minWidth = indonesiaTableWidth + 'px';
        table.style.maxWidth = indonesiaTableWidth + 'px';
        table.style.tableLayout = 'fixed';
        table.style.borderCollapse = 'collapse';
        table.style.borderSpacing = '0';
        table.style.margin = tableIndex === 0 ? '0 0 40px 0' : '0';

        Array.from(table.rows).forEach(function(row) {
          var columnIndex = 0;
          Array.from(row.cells).forEach(function(cell) {
            var span = Math.max(1, Number(cell.getAttribute('colspan')) || 1);
            var width = indonesiaWidths.slice(columnIndex, columnIndex + span).reduce(function(total, value) { return total + value; }, 0);
            cell.setAttribute('width', String(width));
            cell.style.width = width + 'px';
            cell.style.boxSizing = 'border-box';
            cell.style.border = '1px solid #555555';
            cell.style.padding = '2px 4px';
            cell.style.fontFamily = 'Arial, Helvetica, sans-serif';
            cell.style.fontSize = '14px';
            cell.style.lineHeight = '1.15';
            cell.style.color = '#000000';
            cell.style.textAlign = columnIndex === 0 ? 'left' : 'center';
            cell.style.verticalAlign = 'middle';
            cell.style.overflowWrap = 'normal';
            cell.style.wordBreak = 'normal';
            columnIndex += span;
          });
        });
        table.querySelectorAll('thead .email-indonesia-group-row th').forEach(function(cell) {
          cell.setAttribute('bgcolor', '#ffffff');
          cell.style.backgroundColor = '#ffffff';
          cell.style.fontWeight = '700';
          cell.style.height = '22px';
          cell.style.whiteSpace = 'nowrap';
        });
        table.querySelectorAll('thead tr:last-child th').forEach(function(cell) {
          cell.setAttribute('bgcolor', '#cfe5d5');
          cell.style.backgroundColor = '#cfe5d5';
          cell.style.fontWeight = '700';
          cell.style.height = '42px';
          cell.style.whiteSpace = 'normal';
        });
        table.querySelectorAll('tbody tr:not(.email-total-row) td').forEach(function(cell) {
          cell.setAttribute('bgcolor', '#ffffff');
          cell.style.backgroundColor = '#ffffff';
          cell.style.setProperty('font-weight', '400', 'important');
          cell.style.height = '22px';
          cell.style.whiteSpace = 'nowrap';
          cell.querySelectorAll('strong').forEach(function(element) {
            element.replaceWith(document.createTextNode(element.textContent || ''));
          });
          cell.querySelectorAll('*').forEach(function(child) {
            child.style.setProperty('font-weight', '400', 'important');
            child.style.color = '#000000';
          });
        });
        table.querySelectorAll('tbody .email-total-row td, tbody .email-total-row th').forEach(function(cell) {
          cell.setAttribute('bgcolor', '#cfe5d5');
          cell.style.backgroundColor = '#cfe5d5';
          cell.style.setProperty('font-weight', '700', 'important');
          cell.style.height = '22px';
          cell.style.whiteSpace = 'nowrap';
          cell.querySelectorAll('*').forEach(function(child) {
            child.style.setProperty('font-weight', '700', 'important');
            child.style.color = '#000000';
          });
        });
        var wrapper = table.parentElement;
        if (wrapper && wrapper.classList.contains('email-table-scroll')) {
          wrapper.style.width = indonesiaTableWidth + 'px';
          wrapper.style.maxWidth = indonesiaTableWidth + 'px';
          wrapper.style.margin = '0';
          wrapper.style.overflow = 'visible';
        }
      });
    }
    if (fullSummaryCopy) {
      // Outlook's Word renderer recalculates auto-sized tables on paste. Lock
      // the rendered dimensions from the visible Summary so wide detail tables
      // keep the same column proportions and do not reflow unexpectedly.
      var sourceTables = Array.from(source.querySelectorAll('table'));
      var copiedTables = Array.from(clone.querySelectorAll('table'));
      sourceTables.forEach(function(sourceTable, tableIndex) {
        var copiedTable = copiedTables[tableIndex];
        if (!copiedTable) return;
        var sourceTableStyle = window.getComputedStyle(sourceTable);
        ['border-collapse', 'border-spacing', 'table-layout', 'min-width', 'max-width'].forEach(function(property) {
          var value = sourceTableStyle.getPropertyValue(property);
          if (value) copiedTable.style.setProperty(property, value);
        });
        var renderedWidth = Math.round(sourceTable.getBoundingClientRect().width);
        var tableWidth = Math.max(1000, renderedWidth);
        var tableScale = renderedWidth > 0 ? tableWidth / renderedWidth : 1;
        if (tableWidth > 0) {
          copiedTable.style.width = tableWidth + 'px';
          copiedTable.style.maxWidth = tableWidth + 'px';
          copiedTable.setAttribute('width', String(tableWidth));
        }
        var columnCount = Array.from(sourceTable.rows).reduce(function(maxCount, row) {
          var count = Array.from(row.cells).reduce(function(sum, cell) { return sum + (cell.colSpan || 1); }, 0);
          return Math.max(maxCount, count);
        }, 0);
        var sizingRow = Array.from(sourceTable.rows).find(function(row) {
          return Array.from(row.cells).reduce(function(sum, cell) { return sum + (cell.colSpan || 1); }, 0) === columnCount && Array.from(row.cells).every(function(cell) { return cell.colSpan === 1; });
        });
        if (sizingRow && columnCount) {
          var columnWidths = Array.from(sizingRow.cells).map(function(cell) { return Math.round(cell.getBoundingClientRect().width * tableScale); });
          var oldColumnGroup = copiedTable.querySelector('colgroup');
          if (oldColumnGroup) oldColumnGroup.remove();
          var columnGroup = document.createElement('colgroup');
          columnWidths.forEach(function(width) {
            var column = document.createElement('col');
            column.setAttribute('width', String(width));
            column.style.width = width + 'px';
            columnGroup.appendChild(column);
          });
          copiedTable.insertBefore(columnGroup, copiedTable.firstChild);
          copiedTable.style.tableLayout = 'fixed';
        }
        Array.from(sourceTable.rows).forEach(function(sourceRow, rowIndex) {
          var copiedRow = copiedTable.rows[rowIndex];
          if (!copiedRow) return;
          Array.from(sourceRow.cells).forEach(function(sourceCell, cellIndex) {
            var copiedCell = copiedRow.cells[cellIndex];
            if (!copiedCell) return;
            var cellWidth = Math.round(sourceCell.getBoundingClientRect().width);
            if (cellWidth > 0) {
              var scaledCellWidth = Math.round(cellWidth * tableScale);
              var cellFontSize = parseFloat(window.getComputedStyle(sourceCell).fontSize) || 12;
              copiedCell.style.width = scaledCellWidth + 'px';
              copiedCell.style.fontSize = Math.max(12, Math.round(cellFontSize * 1.12)) + 'px';
              copiedCell.style.lineHeight = '1.25';
              copiedCell.style.height = Math.round(sourceCell.getBoundingClientRect().height * tableScale) + 'px';
              copiedCell.setAttribute('width', String(scaledCellWidth));
            }
          });
        });
      });
    }
    var copiedLegend = clone.querySelector('.email-legend');
    if (copiedLegend) {
      copiedLegend.querySelectorAll('td:nth-child(2)').forEach(function(cell) { cell.style.setProperty('font-weight', '700', 'important'); });
      copiedLegend.setAttribute('role', 'presentation');
      copiedLegend.setAttribute('border', '0');
      copiedLegend.setAttribute('cellpadding', '0');
      copiedLegend.setAttribute('cellspacing', '0');
      copiedLegend.setAttribute('width', '360');
      copiedLegend.style.setProperty('display', 'table', 'important');
      copiedLegend.style.setProperty('width', '360px', 'important');
      copiedLegend.style.setProperty('max-width', '360px', 'important');
      copiedLegend.style.setProperty('table-layout', 'fixed', 'important');
      copiedLegend.style.setProperty('border-collapse', 'collapse', 'important');
      copiedLegend.style.setProperty('border-spacing', '0', 'important');
      copiedLegend.style.setProperty('margin', '0 0 26px 0', 'important');
      copiedLegend.querySelectorAll('tr').forEach(function(row) {
        row.setAttribute('height', '24');
        row.style.height = '24px';
      });
      copiedLegend.querySelectorAll('td').forEach(function(cell) {
        cell.setAttribute('bgcolor', '#ffffff');
        cell.setAttribute('height', '24');
        cell.setAttribute('nowrap', 'nowrap');
        cell.setAttribute('valign', 'middle');
        cell.style.setProperty('height', '24px', 'important');
        cell.style.setProperty('padding', '0', 'important');
        cell.style.setProperty('border', '0', 'important');
        cell.style.setProperty('background-color', '#ffffff', 'important');
        cell.style.setProperty('font-family', 'Arial, Helvetica, sans-serif', 'important');
        cell.style.setProperty('font-size', '14px', 'important');
        cell.style.setProperty('font-weight', '700', 'important');
        cell.style.setProperty('line-height', '20px', 'important');
        cell.style.setProperty('mso-line-height-rule', 'exactly');
        cell.style.setProperty('vertical-align', 'middle', 'important');
        cell.style.setProperty('white-space', 'nowrap', 'important');
        cell.setAttribute('style', cell.getAttribute('style') + ';mso-line-height-rule:exactly;');
      });
      copiedLegend.querySelectorAll('td:first-child').forEach(function(cell) {
        cell.setAttribute('width', '24');
        cell.style.setProperty('width', '24px', 'important');
        cell.style.setProperty('padding-right', '8px', 'important');
        cell.style.setProperty('text-align', 'center', 'important');
      });
      copiedLegend.querySelectorAll('td:nth-child(2)').forEach(function(cell) {
        cell.setAttribute('width', '328');
        cell.style.setProperty('width', '328px', 'important');
        cell.style.setProperty('text-align', 'left', 'important');
      });
    }
    clone.querySelectorAll('thead th').forEach(function(cell) { cell.style.textAlign = 'center'; });
    clone.querySelectorAll('thead tr:first-child th:first-child, .email-table .email-column-row th:first-child').forEach(function(cell) { cell.style.textAlign = 'left'; });
    clone.querySelectorAll('.email-detail-table td:first-child, .email-detail-table .email-column-row th:first-child').forEach(function(cell) { cell.style.setProperty('text-align', 'center', 'important'); });
    clone.querySelectorAll('.email-detail-table td:not(:first-child), .email-detail-table .email-column-row th:not(:first-child)').forEach(function(cell) { cell.style.textAlign = 'center'; });
    clone.querySelectorAll('.email-detail-table td:nth-child(2), .email-detail-table td:nth-child(3), .email-detail-table td:nth-child(4), .email-detail-table .email-column-row th:nth-child(2), .email-detail-table .email-column-row th:nth-child(3), .email-detail-table .email-column-row th:nth-child(4)').forEach(function(cell) { cell.style.setProperty('text-align', 'left', 'important'); });
    clone.querySelectorAll('.email-detail-table .email-state-title > th, .email-detail-table .email-state-title > td').forEach(function(cell) {
      cell.setAttribute('bgcolor', '#cee5d4');
      cell.style.setProperty('background-color', '#cee5d4', 'important');
      cell.style.setProperty('white-space', 'nowrap', 'important');
    });
    clone.querySelectorAll('.email-detail-table .email-state-title th').forEach(function(cell) { cell.style.textAlign = 'left'; });
    clone.querySelectorAll('.email-detail-table').forEach(function(table) {
      var noCells = Array.from(table.querySelectorAll('tbody tr:not(.email-state-title) td:first-child')).filter(function(cell) { return /^\d+$/.test(String(cell.textContent || '').trim()); });
      var largestNoLength = noCells.reduce(function(maxLength, cell) { return Math.max(maxLength, String(cell.textContent || '').trim().length); }, 1);
      var noWidth = Math.max(32, largestNoLength * 8 + 14);
      var detailColumnWidths = [noWidth, 352, 114, 140, 64, 72, 114, 112];
      var detailTableWidth = detailColumnWidths.reduce(function(sum, width) { return sum + width; }, 0);
      table.setAttribute('width', String(detailTableWidth));
      table.setAttribute('cellpadding', '0');
      table.setAttribute('cellspacing', '0');
      table.style.setProperty('width', detailTableWidth + 'px', 'important');
      table.style.setProperty('min-width', detailTableWidth + 'px', 'important');
      table.style.setProperty('max-width', detailTableWidth + 'px', 'important');
      table.style.setProperty('table-layout', 'fixed', 'important');
      table.querySelectorAll('th, td').forEach(function(cell) {
        cell.style.setProperty('font-size', '18px', 'important');
        cell.style.setProperty('line-height', '1.25', 'important');
        cell.style.setProperty('height', '27px', 'important');
      });
      Array.from(table.querySelectorAll('col')).forEach(function(column, index) {
        if (detailColumnWidths[index] === undefined) return;
        column.setAttribute('width', String(detailColumnWidths[index]));
        column.style.setProperty('width', detailColumnWidths[index] + 'px', 'important');
      });
      Array.from(table.rows).forEach(function(row) {
        Array.from(row.cells).forEach(function(cell, index) {
          if (cell.colSpan > 1 || detailColumnWidths[index] === undefined) return;
          cell.style.setProperty('width', detailColumnWidths[index] + 'px', 'important');
          cell.setAttribute('width', String(detailColumnWidths[index]));
          cell.setAttribute('nowrap', 'nowrap');
          cell.style.setProperty('white-space', 'nowrap', 'important');
          cell.style.setProperty('overflow-wrap', 'normal', 'important');
          cell.style.setProperty('word-break', 'normal', 'important');
        });
      });
    });
    clone.querySelectorAll('.email-classification th, .email-classification td').forEach(function(cell) {
      cell.style.textAlign = 'center';
    });
    prepareCopiedStatusDots(clone);
    var html = '<div style="background:#ffffff;margin:0;padding:0;border:0;outline:0">' + clone.outerHTML + '</div>', plain = clone.innerText || clone.textContent || '';
    snapshotHost.remove();
    if (options && options.snapshotOnly) return { html: html, text: plain };
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
      } else {
        var holder = document.createElement('div'); holder.contentEditable = 'true'; holder.style.position = 'fixed'; holder.style.left = '-9999px'; holder.innerHTML = html; document.body.appendChild(holder); var selection = window.getSelection(), range = document.createRange(); range.selectNodeContents(holder); selection.removeAllRanges(); selection.addRange(range); document.execCommand('copy'); selection.removeAllRanges(); holder.remove();
      }
      showToast('Full email summary copied. Paste it into Outlook.');
    } catch (error) {
      showToast('Copy was blocked by the browser. Allow clipboard access and try again.');
    }
  }

  function workflowHealthMarkup() {
    var rangeKey = state.view === 'special' ? summaryNetworkRangeKey(b2cStateSummaryWindow()) : selectedRangeKey();
    var audit = state.pitstopReconciliation[rangeKey], sections = [];
    if (audit && (state.view === 'special' || state.view === 'pitstops')) {
      var issues = audit.excluded || [], hasIssues = issues.length > 0;
      var totals = 'HQ/BP panels: ' + formatNumber(audit.rawSales) + ' sales; active Master: ' + formatNumber(audit.activeSales) + '; closed locations: ' + formatNumber(audit.closedSales) + '.';
      var title = hasIssues ? issues.length + ' pitstop mapping issue' + (issues.length === 1 ? '' : 's') + ' - Master review required' : 'Pitstop sales reconciled';
      var details = '';
      if (hasIssues) {
        var excludedSales = issues.reduce(function(sum, row) { return sum + numberValue(row.sales); }, 0);
        details = '<p>' + formatNumber(excludedSales) + ' sales excluded from the network tables.</p><ul class="workflow-mapping-list">' + issues.map(function(row) {
          return '<li><div><strong>' + escapeHtml(row.name || 'Unnamed pitstop') + '</strong><span>' + escapeHtml(row.reason) + '</span></div><span class="workflow-mapping-sales">' + formatNumber(row.sales) + ' sales</span></li>';
        }).join('') + '</ul><a class="workflow-master-link" href="' + (HOSTED_MODE ? '/upload/' : 'Data Upload Centre.html') + '">Review Pitstop Master</a>';
      }
      sections.push('<aside class="data-quality-banner workflow-health ' + (hasIssues ? 'is-error' : 'is-reconciled') + '" role="' + (hasIssues ? 'alert' : 'status') + '" aria-label="Pitstop reconciliation" data-copy-exclude><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(totals) + '</p>' + details + '</aside>');
    }
    if (isSummaryView()) {
      var reason = summaryCopyBlockReason(true);
      if (reason) sections.push('<aside class="data-quality-banner workflow-health" role="status" data-copy-exclude><p>' + escapeHtml('Copy unavailable: ' + reason) + '</p></aside>');
    }
    return sections.join('');
  }

  function render() {
    var root = document.getElementById('viewRoot');
    state.summaryRenderRevision += 1;
    state.summaryCopySnapshot = null;
    root.innerHTML = dataQualityMarkup() + workflowHealthMarkup() + (state.view === 'overview' ? renderOverview() : state.view === 'pitstops' ? renderPitstops() : state.view === 'bgarage' ? renderBGarage() : state.view === 'indonesia' ? renderIndonesia() : state.view === 'special' ? renderEmailSummary() : state.view === 'summary-header' ? renderSummaryHeader() : state.view === 'operations-summary' ? renderOperationsSummary() : state.view === 'bgarage-summary' ? renderManualBGarageSummary() : state.view === 'indonesia-summary' ? renderManualIndonesiaSummary() : renderServicesEnhanced());
    root.insertAdjacentHTML('afterbegin', '<div id="draftRecoveryRoot">' + draftRecoveryMarkup() + '</div>');
    var sourceHealth = root.querySelector('.summary-source-health');
    if (sourceHealth && state.view === 'special') sourceHealth.insertAdjacentHTML('afterend', '<div id="reportReadinessRoot">' + reportReadinessMarkup() + '</div>');
    if (state.view === 'bgarage-summary' || state.view === 'indonesia-summary') {
      applyManualSummaryVisibility();
    }
    mirrorMomentumFilter();
    syncMomentumInsight();
    updateGlobalControls();
    restoreSummaryDrafts();
    updateServiceDraftTotals();
    bindViewEvents();
    if (state.view === 'bgarage-summary' || state.view === 'indonesia-summary') {
      updateManualBGarageCalculations();
      updateManualIndonesiaCalculations(state.summaryDirty.indonesia);
    }
    captureSummaryCopySnapshot();
    syncServiceFullscreen();
    if (state.view === 'special' && state.weekendAverageActive) scheduleWeekendSalesSync(0);
    if (state.view === 'special') {
      var b2cStateWindow = b2cStateSummaryWindow();
      if (b2cStateWindow.preset !== 'report' && !summaryNetworkDataReady(b2cStateWindow) && !state.summaryNetworkLoading && !state.summaryNetworkError) scheduleSummaryNetworkSalesSync(0);
      var weeklyWindow = weeklyRankingWindow();
      if (state.weeklyRankingPreset === 'previous-week' && !weeklyRankingDataReady(weeklyWindow) && !state.weeklyRankingLoading && !state.weeklyRankingError) scheduleWeeklyRankingSalesSync(0);
    }
  }

  function applyRangePreset(preset) {
    // Whole month must use the same live upper bound as the working 14-day
    // preset. Uploaded manual sheets can end several days before Grafana's
    // live Order - Daily data, so using workbook dates here creates a partial
    // or empty month query.
    var last = liveReportEndDate(), first = availableFirstDate();
    state.range = preset;
    if (!last) { state.from = first || ''; state.to = ''; return; }
    if (preset === 'previous') {
      var previousDay = shiftIsoDate(localDateToday(), -1);
      state.from = previousDay;
      state.to = previousDay;
      return;
    }
    state.to = last;
    if (preset === 'all') state.from = first || last;
    else if (preset === 'month') state.from = last.slice(0, 8) + '01';
    else state.from = shiftIsoDate(last, preset === '14d' ? -13 : -6);
    if (first && state.from < first) state.from = first;
  }

  function setRange(preset) {
    applyRangePreset(preset);
    render();
    if (HOSTED_MODE) { window.clearTimeout(syncPitstopRangeAfterFilter.timer); syncPitstopRangeAfterFilter.timer = window.setTimeout(syncPitstopRangeAfterFilter, 100); }
    scheduleEmailSalesSync(100);
    scheduleRsaSync(100);
    scheduleWarrantySync(100);
    scheduleResqSync(100);
  }

  function setCustomReportRangeBound(bound, value) {
    var nextFrom = bound === 'from' ? String(value || '') : state.from;
    var nextTo = bound === 'to' ? String(value || '') : state.to;
    if (bound === 'from' && nextFrom && nextTo && nextFrom > nextTo) nextTo = nextFrom;
    if (bound === 'to' && nextFrom && nextTo && nextTo < nextFrom) nextFrom = nextTo;
    state.from = nextFrom;
    state.to = nextTo;
    state.range = 'custom';
    render();
    window.clearTimeout(syncPitstopRangeAfterFilter.timer);
    syncPitstopRangeAfterFilter.timer = window.setTimeout(syncPitstopRangeAfterFilter, 250);
    scheduleEmailSalesSync(250);
    scheduleRsaSync(250);
    scheduleWarrantySync(250);
    scheduleResqSync(250);
  }

  function mirrorMomentumFilter() {
    var source = document.querySelector('.daily-detail-filter');
    var target = document.querySelector('.overview-side-stack > .panel:first-child .toggle-group');
    if (!source || !target) return;
    var copy = source.cloneNode(true);
    copy.classList.add('momentum-channel-filter');
    target.parentNode.replaceChild(copy, target);
  }

  function syncMomentumInsight() {
    var insight = document.querySelector('.overview-side-stack > .panel:first-child .chart-insight'), rows = rowsInRange();
    if (!insight || !rows.length) return;
    var channel = ['all', 'hq', 'bp'].indexOf(state.dailyDetailChannel) !== -1 ? state.dailyDetailChannel : 'all', latest = rows[rows.length - 1], previous = rows[rows.length - 2], latestValue = salesTotalForChannel(latest, channel), previousValue = previous ? salesTotalForChannel(previous, channel) : 0, delta = previous ? latestValue - previousValue : null, label = channel === 'all' ? 'HQ and BP' : dailyDetailLabel(channel);
    insight.innerHTML = '<strong>' + (delta === null ? 'Latest day total.' : delta >= 0 ? 'Sales increased.' : 'Sales decreased.') + '</strong><span>' + formatNumber(latestValue) + ' units' + (delta === null ? ' for ' + label + '.' : ' · ' + (delta >= 0 ? '+' : '') + formatNumber(delta) + ' units versus the prior day.') + '</span>';
  }

  function syncServiceFullscreen() {
    var active = state.view === 'services' && state.serviceFullscreenIndex >= 0;
    document.body.classList.toggle('service-fullscreen-open', active);
    document.querySelectorAll('[data-service-card-index]').forEach(function(card) {
      var index = Number(card.getAttribute('data-service-card-index'));
      card.classList.toggle('is-service-fullscreen', active && index === state.serviceFullscreenIndex);
    });
  }

  function moveServiceFullscreen(direction) {
    var count = document.querySelectorAll('[data-service-card-index]').length || 4;
    var current = state.serviceFullscreenIndex >= 0 ? state.serviceFullscreenIndex : 0;
    state.serviceFullscreenIndex = (current + direction + count) % count;
    render();
  }

  function showToast(message) {
    var toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('is-visible'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(function() { toast.classList.remove('is-visible'); }, 3000);
  }

  function syncBodyModalState() {
    var uploadDialog = document.getElementById('uploadCentreDialog');
    var overwriteDialog = document.getElementById('overwriteConfirmDialog');
    var modalOpen = Boolean((uploadDialog && !uploadDialog.hidden) || (overwriteDialog && !overwriteDialog.hidden));
    document.body.classList.toggle('modal-open', modalOpen);
  }

  function closeOverwriteConfirmation(confirmed) {
    var dialog = document.getElementById('overwriteConfirmDialog');
    var resolver = overwriteConfirmResolver;
    var trigger = overwriteConfirmTrigger;
    overwriteConfirmResolver = null;
    overwriteConfirmTrigger = null;
    if (dialog) dialog.hidden = true;
    syncBodyModalState();
    if (trigger && typeof trigger.focus === 'function') trigger.focus();
    if (resolver) resolver(Boolean(confirmed));
  }

  function confirmSummaryOverwrite(options) {
    if (overwriteConfirmResolver) return Promise.resolve(false);
    var dialog = document.getElementById('overwriteConfirmDialog');
    var title = document.getElementById('overwriteConfirmTitle');
    var message = document.getElementById('overwriteConfirmMessage');
    var cancelButton = document.getElementById('overwriteConfirmCancel');
    if (!dialog || !title || !message || !cancelButton) return Promise.resolve(false);
    title.textContent = options && options.title || 'Overwrite saved data?';
    message.textContent = options && options.message || 'Saving will replace the existing record.';
    document.getElementById('overwriteConfirmAccept').textContent = options && options.confirmLabel || 'Overwrite and save';
    overwriteConfirmTrigger = document.activeElement;
    dialog.hidden = false;
    syncBodyModalState();
    window.setTimeout(function() { cancelButton.focus(); }, 0);
    return new Promise(function(resolve) { overwriteConfirmResolver = resolve; });
  }

  function bindOverwriteConfirmation() {
    var dialog = document.getElementById('overwriteConfirmDialog');
    var cancelButton = document.getElementById('overwriteConfirmCancel');
    var acceptButton = document.getElementById('overwriteConfirmAccept');
    if (!dialog || !cancelButton || !acceptButton) return;
    cancelButton.addEventListener('click', function() { closeOverwriteConfirmation(false); });
    acceptButton.addEventListener('click', function() { closeOverwriteConfirmation(true); });
    dialog.addEventListener('click', function(event) { if (event.target === dialog) closeOverwriteConfirmation(false); });
    dialog.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeOverwriteConfirmation(false);
        return;
      }
      if (event.key !== 'Tab') return;
      var first = cancelButton, last = acceptButton;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  async function logoutDashboard() {
    var button = document.getElementById('logoutButton');
    if (!button || button.disabled) return;
    var originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Signing out…';
    try {
      if (!HOSTED_MODE) {
        showToast('Local preview has no sign-in session.');
        button.disabled = false;
        button.textContent = originalLabel;
        return;
      }
      var response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('logout failed');
      window.location.replace('/login');
    } catch (_) {
      button.disabled = false;
      button.textContent = originalLabel;
      showToast('Could not sign out. Please try again.');
    }
  }

  function hideToast() {
    var toast = document.getElementById('toast'); window.clearTimeout(showToast.timer); toast.classList.remove('is-visible');
  }

  function showNotice(message) { var notice = document.getElementById('notice'); notice.textContent = message; notice.hidden = !message; }
  function setProgress(active) { document.getElementById('progressLine').hidden = !active; }

  function updateUploadCentre() {
    var status = document.getElementById('uploadCentreStatus');
    if (!status || !state.data) return;
    var source = state.data.sourceName || state.sourceName || 'Built-in reference dataset';
    var isPreview = String(source).indexOf('Built-in') === 0;
    var dailyRows = (state.data.dailySales || []).length;
    var pitstopRows = (state.data.pitstops || []).length;
    var bgarageRows = (state.data.bgarage || []).length;
    var loadedDate = state.data.loadedAt ? formatDate(state.data.loadedAt, true) : 'Not available';
    status.innerHTML = '<div class="upload-centre-status-head"><strong>' + (isPreview ? 'Reference data ready' : 'Dashboard data ready') + '</strong><span class="upload-centre-status-badge' + (isPreview ? ' preview' : '') + '">' + (isPreview ? 'Preview' : 'Loaded') + '</span></div>' +
      '<div class="upload-centre-status-source" title="' + escapeHtml(source) + '">' + escapeHtml(source) + '</div>' +
      '<div class="upload-centre-status-grid"><div><span>Daily dates</span><strong>' + formatNumber(dailyRows) + '</strong></div><div><span>Pitstops</span><strong>' + formatNumber(pitstopRows) + '</strong></div><div><span>BGarage rows</span><strong>' + formatNumber(bgarageRows) + '</strong></div></div>' +
      '<div class="upload-centre-status-source">Report range: ' + escapeHtml(dailyRows ? formatRange(firstDate(), lastDate()) : 'No dates loaded') + ' · Loaded: ' + escapeHtml(loadedDate) + '</div>';
  }

  function openUploadCentre() {
    var dialog = document.getElementById('uploadCentreDialog');
    if (!dialog) return;
    dialog.hidden = false;
    syncBodyModalState();
    updateUploadCentre();
    var dropzone = document.getElementById('uploadDropzone');
    if (dropzone) dropzone.focus();
  }

  function closeUploadCentre() {
    var dialog = document.getElementById('uploadCentreDialog');
    if (!dialog) return;
    dialog.hidden = true;
    syncBodyModalState();
  }

  function bindUploadCentre() {
    var dialog = document.getElementById('uploadCentreDialog');
    var dropzone = document.getElementById('uploadDropzone');
    var fileInput = document.getElementById('fileInput');
    var dataUploadButton = document.getElementById('dataUploadButton');
    var chooseButton = document.getElementById('uploadCentreChoose');
    var templateButton = document.getElementById('uploadCentreTemplate');
    var sharePointButton = document.getElementById('uploadCentreSharePoint');
    var closeButton = document.getElementById('uploadCentreClose');
    var doneButton = document.getElementById('uploadCentreDone');
    if (dataUploadButton) dataUploadButton.addEventListener('click', function() { window.location.href = HOSTED_MODE ? '/upload/' : 'Data Upload Centre.html'; });
    if (chooseButton && fileInput) chooseButton.addEventListener('click', function() { fileInput.click(); });
    if (templateButton) templateButton.addEventListener('click', templateWorkbook);
    if (sharePointButton) sharePointButton.addEventListener('click', promptSharePointWorkbook);
    if (closeButton) closeButton.addEventListener('click', closeUploadCentre);
    if (doneButton) doneButton.addEventListener('click', closeUploadCentre);
    if (dialog) dialog.addEventListener('click', function(event) { if (event.target === dialog) closeUploadCentre(); });
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', function() { fileInput.click(); });
      dropzone.addEventListener('keydown', function(event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); } });
      dropzone.addEventListener('dragover', function(event) { event.preventDefault(); dropzone.classList.add('is-dragging'); });
      dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('is-dragging'); });
      dropzone.addEventListener('drop', function(event) { event.preventDefault(); dropzone.classList.remove('is-dragging'); var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]; if (file) importFile(file); });
    }
    window.addEventListener('beforeunload', function(event) { if (Object.keys(state.summaryDrafts).length) { event.preventDefault(); event.returnValue = ''; } });
    document.addEventListener('keydown', function(event) { if (event.key === 'Escape' && dialog && !dialog.hidden) closeUploadCentre(); });
  }

  function templateWorkbook() {
    var xlsx = window.XLSX;
    if (!xlsx) { showNotice('Excel support is unavailable in this browser.'); return; }
    var workbook = xlsx.utils.book_new();
    var dailyRows = state.data.dailySales.map(function(row) { return { Date: row.date, HQ: row.hq, BP: row.bp, WH: row.whAvailable ? row.wh : '' }; });
    var serviceRows = state.data.dailySales.map(function(row) { return { Date: row.date, 'RSA Jumpstart': row.rsaJumpstart, 'RSA Tyre Patch': row.rsaTyrePatch, 'RSA Fuel': row.rsaFuel, B2W: row.b2w, 'ResQ Selangor': row.resQSelangor, 'ResQ JB': row.resQJb, 'ResQ Pahang': row.resQPahang, 'ResQ Penang': row.resQPenang, 'Warranty 1st': row.warranty1st, 'Warranty 2nd': row.warranty2nd, 'Warranty 3rd': row.warranty3rd }; });
    var pitRows = state.data.pitstops.map(function(row) { return { Date: row.date || '', Channel: row.channel, Pitstop: row.name, Region: row.region, State: row.state, Tier: row.tier, Target: row.target, Sales: row.sales, Status: row.status }; });
    var pitstopMasterRows = (state.data.pitstopMaster || []).map(function(row) { return { No_ID: row.id, Branch: row.name, State: row.state, Type: row.type || (row.channel === 'HQC' ? 'HQ' : row.channel === 'BPC' ? 'BP' : row.channel), Tier: row.tier, branch_status: row.branchStatus, City: row.city, Zone: row.zone, Country: row.country, Date_Live: row.dateLive, Latitude: row.latitude, Longitude: row.longitude }; });
    var pitstopRelocationRows = (state.data.pitstopRelocations || []).map(function(row) { return { Relocation: row.from, To: row.to, 'Relocation Date': row.relocationDate || '' }; });
    var bgarageRows = (state.data.bgarage || []).map(function(row) { return { Date: row.date, Outlet: row.outlet, 'Daily Sales Target RM': row.dailyTarget, 'Daily Actual Sales RM': row.dailyActual, 'MTD Actual Sales RM': row.mtdActual, 'Monthly Target': row.monthlyTarget, 'Special Cases Referred': row.referrals, 'Successful Conversions': row.conversions, 'Pick & Drop Cases': row.pickDrop, 'Daily Intake Actual': row.intakeActual, 'Daily Intake Target': row.intakeTarget }; });
    var indonesiaRows = (state.data.indonesia || []).map(function(row) { return { Date: row.date, Pitstop: row.pitstop, 'Total Lead': row.totalLead, 'Pending Lead': row.pendingLead, 'Cancelled Lead': row.cancelledLead, 'Bateriku Jumpstart': row.baterikuJumpstart, 'Bateriku Battery': row.baterikuBattery, 'Partner Jumpstart': row.partnerJumpstart, 'Partner Battery': row.partnerBattery }; });
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(dailyRows), 'Daily Sales');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(serviceRows), 'Service & Warranty');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(pitRows), 'Pitstops');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(pitstopMasterRows.length ? pitstopMasterRows : [{ No_ID: '', Branch: '', State: '', Type: '', Tier: '', branch_status: '', City: '', Zone: '', Country: '', Date_Live: '', Latitude: '', Longitude: '' }]), 'Pitstop Master');
    if (pitstopRelocationRows.length) xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(pitstopRelocationRows), 'Pitstop Relocations');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(bgarageRows), 'BGarage');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(indonesiaRows.length ? indonesiaRows : [{ Date: '', Pitstop: '', 'Total Lead': '', 'Pending Lead': '', 'Cancelled Lead': '', 'Bateriku Jumpstart': '', 'Bateriku Battery': '', 'Partner Jumpstart': '', 'Partner Battery': '' }]), 'Indonesia');
    xlsx.writeFile(workbook, 'daily-report-dashboard-template.xlsx');
    showToast('Excel template downloaded.');
  }

  async function importFile(file) {
    setProgress(true); showNotice(''); showToast('Loading ' + file.name + '...');
    try {
      var payload;
      if (/\.json$/i.test(file.name)) payload = JSON.parse(await file.text());
      else {
        var workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
        payload = { dailySales: workbookRows(workbook, WORKBOOK_SHEETS.dailySales), serviceWarranty: workbookRows(workbook, WORKBOOK_SHEETS.serviceWarranty), pitstops: workbookRows(workbook, WORKBOOK_SHEETS.pitstops), pitstopMaster: workbookRows(workbook, WORKBOOK_SHEETS.pitstopMaster), pitstopRelocations: workbookRows(workbook, WORKBOOK_SHEETS.pitstopRelocations), bgarage: workbookRows(workbook, WORKBOOK_SHEETS.bgarage), indonesia: workbookRows(workbook, WORKBOOK_SHEETS.indonesia), settings: workbookRows(workbook, WORKBOOK_SHEETS.settings), sourceName: 'Uploaded: ' + file.name, generatedAt: localDateToday() };
      }
      state.data = normalizePayload(payload, 'Uploaded: ' + file.name); state.sourceName = state.data.sourceName; state.grafanaPitstopSalesByKey = null; state.weekendPitstopSalesByKey = null; state.weekendPitstopSyncKey = ''; state.weekendSalesSyncKey = ''; state.grafanaPitstopChannelTotals = null; state.pitstopTotalsSyncRange = ''; state.pitstopSyncRange = ''; state.emailSalesSyncRange = ''; resetSummaryNetworkSales(); applyRangePreset('month'); state.selectedKey = ''; saveStored(state.data); clearSharedWorkbook(); render(); updateUploadCentre(); scheduleHostedWorkbookSync(); hideToast(); showToast('Data loaded from ' + file.name + '.');
    } catch (error) { hideToast(); showNotice('Could not read this file. Check the JSON format or the Excel sheet names: Daily Sales, Service & Warranty, Pitstops, BGarage, Indonesia (optional).'); }
    finally { setProgress(false); }
  }

  function promptSharePointWorkbook() {
    var current = readSharePointSource();
    var value = window.prompt('Paste the SharePoint Excel link. Use a link your browser can open.', current);
    if (value === null) return;
    loadSharePointWorkbook(value);
  }

  function clearLiveDataCachesForRefresh() {
    [activePitstopRequest, activeEmailSalesRequest, activeRsaRequest, activeResqRequest, activeWarrantyRequest, weekendSalesRequest, summaryNetworkSalesRequest].forEach(function(request) {
      if (request && request.controller) request.controller.abort();
    });
    activePitstopRequest = null;
    activeEmailSalesRequest = null;
    activeRsaRequest = null;
    activeResqRequest = null;
    activeWarrantyRequest = null;
    weekendSalesRequest = null;
    summaryNetworkSalesRequest = null;
    pitstopResponseCache = {};
    emailSalesResponseCache = {};
    rsaResponseCache = {};
    resqResponseCache = {};
    warrantyResponseCache = {};
    state.pitstopSyncRange = '';
    state.emailSalesSyncRange = '';
    state.rsaSyncRange = '';
    state.resqSyncRange = '';
    state.warrantySyncRange = '';
    state.weekendSalesSyncKey = '';
    state.weekendPitstopSyncKey = '';
    resetSummaryNetworkSales();
  }

  async function refreshDashboard() {
    if (HOSTED_MODE) {
      if (state.cloudLoading) return;
      state.forceDataRefresh = true;
      clearLiveDataCachesForRefresh();
      try {
        await loadHostedData(true);
        await Promise.allSettled([loadManualB2wValues(), loadManualRsaValues(), loadManualReportValues('bgarage'), loadManualReportValues('indonesia')]);
        if (state.view === 'special' && b2cStateSummaryWindow().preset !== 'report') await syncSummaryNetworkSales();
      } finally {
        state.forceDataRefresh = false;
        render();
      }
      return;
    }
    var sharePointSource = readSharePointSource();
    if (sharePointSource) { loadSharePointWorkbook(sharePointSource); return; }
    var latest = readSharedWorkbook() || readStored();
    if (latest) { state.data = normalizePayload(latest, latest.sourceName || 'Last local upload'); state.sourceName = state.data.sourceName; state.from = firstDate(); state.to = lastDate(); }
    render();
    showToast('Dashboard refreshed.');
  }

  function exportReport() {
    var clone = document.documentElement.cloneNode(true), oldBaked = clone.querySelector('#bakedData');
    if (oldBaked) oldBaked.remove();
    var clonedToast = clone.querySelector('#toast');
    if (clonedToast) { clonedToast.classList.remove('is-visible'); clonedToast.textContent = ''; }
    var clonedBody = clone.querySelector('body');
    if (clonedBody) clonedBody.removeAttribute('data-report-mode');
    var baked = clone.ownerDocument.createElement('script'); baked.id = 'bakedData'; baked.textContent = 'window.__BAKED_DATA__ = ' + JSON.stringify(state.data).replace(/<\/script/gi, '<\\/script') + ';'; var clonedHead = clone.querySelector('head'); if (clonedHead) clonedHead.appendChild(baked);
    var stamp = lastDate() || new Date().toISOString().slice(0, 10), blob = new Blob(['<!doctype html>\n' + clone.outerHTML], { type: 'text/html' }), link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'Bateriku_Sales_Report_' + stamp + '.html'; link.click(); window.setTimeout(function() { URL.revokeObjectURL(link.href); }, 2000); showToast('Standalone report exported.');
  }

  var concurrencyHeartbeatTimer = 0;
  var appVersionCheckTimer = 0;

  async function checkAppVersion() {
    if (!HOSTED_MODE || !window.__DASHBOARD_BUILD_ID__) return;
    try {
      var response = await fetch('/version.json?check=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      var payload = await response.json();
      var notice = document.getElementById('appVersionNotice');
      if (!notice) return;
      notice.hidden = !payload.buildId || payload.buildId === window.__DASHBOARD_BUILD_ID__;
    } catch (_) {
      // Version checks must never interrupt report work during a network issue.
    }
  }

  function startAppVersionChecks() {
    if (!HOSTED_MODE || appVersionCheckTimer) return;
    checkAppVersion();
    appVersionCheckTimer = window.setInterval(checkAppVersion, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', function() { if (!document.hidden) checkAppVersion(); });
  }

  function concurrencyReturnPath() {
    return window.location.pathname + window.location.search;
  }

  function redirectToWaitingRoom() {
    window.location.replace('/waiting-room?next=' + encodeURIComponent(concurrencyReturnPath()));
  }

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
        window.location.replace('/login?next=' + encodeURIComponent(concurrencyReturnPath()));
        return;
      }
      if (!response.ok) return;
      var result = await response.json();
      if (!result || result.status !== 'admitted') redirectToWaitingRoom();
    } catch (_) {
      // A transient network error must not evict an otherwise active session.
    }
  }

  function startConcurrencyHeartbeat() {
    if (!HOSTED_MODE || concurrencyHeartbeatTimer) return;
    sendConcurrencyHeartbeat();
    concurrencyHeartbeatTimer = window.setInterval(sendConcurrencyHeartbeat, 30000);
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) sendConcurrencyHeartbeat();
    });
  }

  function init() {
    var baked = window.__BAKED_DATA__, stored = baked ? null : readStored(), shared = baked ? null : readSharedWorkbook(), raw = baked || shared || stored || seedPayload;
    state.sourceName = baked ? 'Baked standalone report' : shared ? (shared.sourceName || 'Data Upload Centre upload') : stored ? 'Last local upload' : 'Built-in reference dataset';
    state.data = normalizePayload(raw, state.sourceName); applyRangePreset('month');
    document.addEventListener('keydown', function(event) { if (event.key === 'Escape' && state.serviceFullscreenIndex >= 0) { state.serviceFullscreenIndex = -1; render(); } });
    function openDashboardView(view) {
      state.view = view;
      state.selectedKey = '';
      state.serviceFullscreenIndex = -1;
      if (state.view === 'pitstops') { state.pitStatus = 'all'; state.pitChannels = ['HQ', 'WH']; state.pitRegion = 'all'; state.pitState = 'all'; state.pitTier = 'all'; state.pitArrange = 'state'; state.pitSearch = ''; }
      // The email-ready Summary keeps its primary report month-to-date, while
      // its independent B2C/B2B2C performance tables open on Previous Day.
      if (state.view === 'special') {
        state.b2cStateSummaryPreset = 'previous';
        resetSummaryNetworkSales();
        state.weeklyRankingPreset = 'current';
        resetWeeklyRankingSales();
      }
      if (isSummaryView() && !state.summaryOpened) { state.summaryOpened = true; setRange('month'); return; }
      render();
      scheduleEmailSalesSync(0);
      scheduleRsaSync(0);
      scheduleWarrantySync(0);
      scheduleResqSync(0);
      if (state.view === 'special' || state.view === 'summary-header' || state.view === 'pitstops') scheduleHostedWorkbookSync();
    }
    document.querySelectorAll('.nav-item').forEach(function(button) { button.addEventListener('click', function() { openDashboardView(button.getAttribute('data-view')); }); });
    var summarySwitcher = document.getElementById('summaryReportSwitcher');
    if (summarySwitcher) summarySwitcher.addEventListener('click', function(event) {
      var button = event.target.closest('[data-summary-view]');
      if (!button || !summarySwitcher.contains(button) || button.disabled) return;
      event.preventDefault();
      openDashboardView(button.getAttribute('data-summary-view'));
    });
    document.querySelectorAll('[data-range]').forEach(function(button) { button.addEventListener('click', function() { setRange(button.getAttribute('data-range')); }); });
    document.getElementById('fromDate').addEventListener('change', function(event) { setCustomReportRangeBound('from', event.target.value); });
    document.getElementById('toDate').addEventListener('change', function(event) { setCustomReportRangeBound('to', event.target.value); });
    var refreshButton = document.getElementById('refreshButton');
    var versionReloadButton = document.getElementById('appVersionReload');
    var logoutButton = document.getElementById('logoutButton');
    var templateButton = document.getElementById('templateButton');
    var sharePointButton = document.getElementById('sharePointButton');
    var uploadButton = document.getElementById('uploadButton');
    var exportButton = document.getElementById('exportButton');
    var fileInput = document.getElementById('fileInput');
    if (refreshButton) refreshButton.addEventListener('click', refreshDashboard);
    if (versionReloadButton) versionReloadButton.addEventListener('click', function() { window.location.reload(); });
    if (logoutButton) logoutButton.addEventListener('click', logoutDashboard);
    if (templateButton) templateButton.addEventListener('click', templateWorkbook);
    if (sharePointButton) sharePointButton.addEventListener('click', promptSharePointWorkbook);
    if (uploadButton && fileInput) uploadButton.addEventListener('click', function() { fileInput.click(); });
    if (exportButton) exportButton.addEventListener('click', exportReport);
    if (fileInput) fileInput.addEventListener('change', function(event) { if (event.target.files && event.target.files[0]) importFile(event.target.files[0]); event.target.value = ''; });
    window.addEventListener('storage', function(event) {
      if (event.key !== SHARED_WORKBOOK_KEY || !event.newValue) return;
      var sharedUpload = readSharedWorkbook();
      if (!sharedUpload) return;
      applyWorkbookPayload(sharedUpload, sharedUpload.sourceName || 'Data Upload Centre upload', 'New workbook loaded from Data Upload Centre.');
    });
    window.addEventListener('message', function(event) {
      var message = event && event.data;
      if (!message || message.type !== 'daily-report-dashboard-workbook' || !message.payload) return;
      applyWorkbookPayload(message.payload, message.payload.sourceName || 'Data Upload Centre upload', 'Workbook loaded from Data Upload Centre.');
    });
    bindUploadCentre();
    bindOverwriteConfirmation();
    bindReportWorkflow();
    readRecoverableDrafts();
    if (!HOSTED_MODE) {
      state.manualB2wValues = readLocalB2wValues();
      state.manualRsaValues = readLocalRsaValues();
      state.manualBGarageSummaryValues = readLocalManualReport(BGARAGE_SUMMARY_LOCAL_STORAGE_KEY);
      state.manualIndonesiaSummaryValues = readLocalManualReport(INDONESIA_SUMMARY_LOCAL_STORAGE_KEY);
    }
    render();
    if (HOSTED_MODE) {
      startConcurrencyHeartbeat();
      startAppVersionChecks();
      loadHostedData(false);
      loadManualB2wValues();
      loadManualRsaValues();
      loadManualReportValues('bgarage');
      loadManualReportValues('indonesia');
    }
    else if (!baked && readSharePointSource()) loadSharePointWorkbook(readSharePointSource());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
