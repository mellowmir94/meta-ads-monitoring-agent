const filterNames = ['branch_name', 'arrival_status', 'order_status', 'level', 'battery_size', 'sales_source', 'rider_category'];
const error = (message, status = 400) => Object.assign(new Error(message), { status });
export const riderKey = value => String(value || '').trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');

export function commissionWeek(periodStart, periodEnd) {
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(periodStart) || !valid(periodEnd) || new Date(periodStart).getUTCDay() !== 1 || Date.parse(periodEnd) - Date.parse(periodStart) !== 6 * 86400000) {
    throw error('EPF requires a full Monday–Sunday commission week.');
  }
  return { periodStart, periodEnd };
}

function sourceTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  const normalized = value.trim().replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : normalized + 'Z');
}

/** Only the service binding is used; browser filter selections and totals are never trusted. */
export async function verifyWeeklyCommission(env, input, now = () => new Date()) {
  const { periodStart, periodEnd } = commissionWeek(input.periodStart, input.periodEnd);
  const rider = typeof input.rider === 'string' ? input.rider.trim() : '';
  if (!rider || rider.length > 200) throw error('Rider is required (maximum 200 characters).');
  if (!env.GRAFANA_PROXY?.fetch || !env.FINANCE_PROXY_SHARED_SECRET) throw error('Weekly commission verification is unavailable. No EPF deduction was saved.', 503);
  const url = new URL('https://daily-report.internal/api/internal/finance-data');
  Object.entries({ panel: 'commission-main', scope: 'grafana', part: 'primary', from: periodStart, to: periodEnd, refresh: '1', filters: JSON.stringify(Object.fromEntries(filterNames.map(name => [name, ['$__all']]))) }).forEach(([key, value]) => url.searchParams.set(key, value));
  let payload;
  try {
    const response = await env.GRAFANA_PROXY.fetch(new Request(url, { headers: { 'x-finance-proxy-secret': env.FINANCE_PROXY_SHARED_SECRET }, signal: AbortSignal.timeout(45000) }));
    if (!response.ok) throw error('Grafana weekly commission could not be verified. Try again before saving EPF.', 503);
    payload = await response.json();
  } catch (cause) {
    throw error(cause.status ? cause.message : 'Grafana weekly commission verification failed. No EPF deduction was saved.', cause.status || 503);
  }
  const fromMs = Date.parse(periodStart + 'T00:00:00Z');
  const toMs = Date.parse(periodEnd + 'T23:59:59Z');
  if (!payload?.ok || payload.source !== 'Grafana Finance' || payload.panel !== 'commission-main' || payload.part !== 'primary' || payload.truncated !== false || payload.error || payload.summaryError || !Array.isArray(payload.rows) || payload.rowCount !== payload.rows.length || sourceTimestamp(payload.from) !== fromMs || sourceTimestamp(payload.to) !== toMs) {
    throw error('Grafana returned incomplete or mismatched weekly data. EPF verification is blocked.', 503);
  }
  const key = riderKey(rider);
  let amountCents = 0; let rowCount = 0;
  const identifiers = new Set();
  const seenRows = new Set();
  for (const row of payload.rows) {
    if (!row || !riderKey(row.rider_name)) throw error('Weekly data contains an unidentified rider. EPF verification is blocked.', 503);
    if (riderKey(row.rider_name) !== key) continue;
    const rowSignature = JSON.stringify(row, Object.keys(row).sort());
    if (seenRows.has(rowSignature)) throw error('Grafana returned a duplicate commission row for this rider. EPF verification is blocked.', 503);
    seenRows.add(rowSignature);
    const created = sourceTimestamp(row.created_at);
    const commission = row.commission;
    if (!Number.isFinite(created) || created < fromMs || created >= toMs + 1000 || (typeof commission !== 'number' && (typeof commission !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(commission.trim()))) || !Number.isFinite(Number(commission))) {
      throw error('The rider’s weekly commission rows are incomplete or invalid. EPF verification is blocked.', 503);
    }
    const cents = Math.round(Number(commission) * 100);
    if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(amountCents + cents)) throw error('Weekly commission is outside the supported amount range.', 503);
    amountCents += cents; rowCount += 1;
    if (row.rider_id != null && String(row.rider_id).trim()) identifiers.add(String(row.rider_id).trim());
  }
  if (identifiers.size > 1) throw error('This rider name matches multiple rider IDs. Finance must resolve the identity before EPF.', 409);
  return { rider, riderKey: key, periodStart, periodEnd, amountCents, rowCount, verifiedAt: now().toISOString(), source: 'Grafana Finance', eligible: rowCount > 0 && amountCents >= 30000 };
}

export function requireEpfVerification(verification, record) {
  if (!verification || verification.source !== 'Grafana Finance' || verification.riderKey !== riderKey(record.rider) || verification.periodStart !== record.periodStart || verification.periodEnd !== record.periodEnd || !Number.isSafeInteger(verification.amountCents) || verification.amountCents < 30000 || !Number.isInteger(verification.rowCount) || verification.rowCount <= 0 || verification.eligible !== true || !Number.isFinite(Date.parse(verification.verifiedAt))) {
    throw error('EPF requires verified full-week Grafana commission of RM300 or more.');
  }
  return verification;
}
