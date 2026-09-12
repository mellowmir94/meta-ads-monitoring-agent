// Exact fallback comparison for Commission when the active scope has fewer than two reliable daily points.
const commissionPreviousPeriod = { key: '', pending: '', result: null, error: '' };

function commissionPreviousPeriodKey(panel) {
  const dates = state.dates[panel.id] || {};
  return auditStable({ dates, filters: financeGrafanaFilterScope(panel.id) });
}

function commissionUtcBoundaryText(epoch) {
  const date = new Date(epoch);
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0') + ' ' + String(date.getUTCHours()).padStart(2, '0') + ':' + String(date.getUTCMinutes()).padStart(2, '0') + ':' + String(date.getUTCSeconds()).padStart(2, '0');
}

async function ensureCommissionPreviousPeriod(panel) {
  if (LOCAL_PREVIEW || panel?.id !== 'commission-main' || state.api?.loading?.[panel.id]) return;
  const key = commissionPreviousPeriodKey(panel);
  if (commissionPreviousPeriod.key === key && (commissionPreviousPeriod.result || commissionPreviousPeriod.error) || commissionPreviousPeriod.pending === key) return;
  const dates = state.dates[panel.id] || {};
  const start = financeBoundaryEpoch(dates.start, false, panel.id), end = financeBoundaryEpoch(dates.end, true, panel.id);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return;
  const duration = end - start + 1;
  const previousEnd = start - 1, previousStart = previousEnd - duration + 1;
  commissionPreviousPeriod.pending = key;
  try {
    const params = new URLSearchParams({ panel: panel.id, scope: 'selection', part: 'primary', from: commissionUtcBoundaryText(previousStart), to: commissionUtcBoundaryText(previousEnd), filters: financeGrafanaFilterParam(panel.id), revision: 'commission-kpi-previous-period-v1' });
    const { response, payload } = await requestFinancePayload(FINANCE_API_ENDPOINT + '?' + params, 'commission-previous-period:' + key);
    if (!response.ok) throw new Error(payload.error || 'Previous-period commission is unavailable.');
    const source = Array.isArray(payload.metricRows) && payload.metricRows.length ? await canonicalizeFinanceRows(panel, payload.metricRows) : payload.truncated ? [] : await canonicalizeFinancePayloadRows(panel, payload);
    if (!source.length) throw new Error('Previous-period commission is unavailable.');
    const stats = grafanaCommissionStats(source);
    if (!Number.isFinite(stats.totalCommission)) throw new Error('Previous-period commission is invalid.');
    if (commissionPreviousPeriod.pending !== key) return;
    commissionPreviousPeriod.key = key;
    commissionPreviousPeriod.result = { value: stats.totalCommission, date: String(params.get('to')).slice(0, 10), currentDate: String(dates.end).slice(0, 10) };
    commissionPreviousPeriod.error = '';
  } catch (error) {
    if (commissionPreviousPeriod.pending !== key) return;
    commissionPreviousPeriod.key = key;
    commissionPreviousPeriod.result = null;
    commissionPreviousPeriod.error = error.message || 'Previous-period commission is unavailable.';
  } finally {
    if (commissionPreviousPeriod.pending === key) commissionPreviousPeriod.pending = '';
    render();
  }
}

function commissionPreviousPeriodTrend(panel, kpi) {
  if (panel?.id !== 'commission-main' || kpi?.metric !== 'commission' || commissionPreviousPeriod.key !== commissionPreviousPeriodKey(panel) || !commissionPreviousPeriod.result) return null;
  const prior = commissionPreviousPeriod.result;
  const trend = decisionKpiTrend(kpi, { points: [{ date: prior.date, values: { commission: prior.value } }, { date: prior.currentDate, values: { commission: kpi.rawValue } }], basis: 'Official Grafana totals for the active period and the immediately preceding equal-length period.' });
  if (trend.comparable) trend.caption = 'vs previous period';
  return trend;
}
