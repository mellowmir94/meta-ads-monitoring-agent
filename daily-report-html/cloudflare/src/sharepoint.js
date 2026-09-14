const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

function text(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function number(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = text(value).replace(/[^0-9,.-]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function excelSerialDate(value) {
  const serial = number(value);
  if (serial === null || serial < 1 || serial > 100000) return '';
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return date.toISOString().slice(0, 10);
}

export function parseSourceDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = text(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const serialDate = excelSerialDate(raw);
  if (serialDate) return serialDate;
  const match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!match) return '';
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  return `${match[3]}-${month}-${day}`;
}

function findHeader(values) {
  let best = null;
  (Array.isArray(values) ? values : []).forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;
    const cells = row.map(normalized);
    const dateIndex = cells.findIndex((cell) => cell === 'invoicedate' || cell === 'datein' || cell === 'date');
    const quantityIndex = cells.findIndex((cell) => cell === 'sumofquantity' || cell === 'quantity' || cell === 'totalitem' || cell === 'totalquantity');
    if (dateIndex < 0 || quantityIndex < 0) return;
    const score = (cells.some((cell) => cell.includes('lineamount') || cell.includes('amount')) ? 2 : 0) + (cells.some((cell) => cell.includes('sales')) ? 1 : 0);
    if (!best || score > best.score) best = { rowIndex, dateIndex, quantityIndex, score };
  });
  return best;
}

export function parseB2wWorksheetValues(values) {
  const header = findHeader(values);
  if (!header) return [];
  const totals = new Map();
  for (let index = header.rowIndex + 1; index < values.length; index += 1) {
    const row = Array.isArray(values[index]) ? values[index] : [];
    const date = parseSourceDate(row[header.dateIndex]);
    if (!date) continue;
    const quantity = number(row[header.quantityIndex]);
    if (quantity === null || quantity < 0) continue;
    totals.set(date, (totals.get(date) || 0) + quantity);
  }
  return [...totals.entries()]
    .map(([date, value]) => ({ date, value: Math.round(value) }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function shareId(url) {
  const encoded = btoa(text(url)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `u!${encoded}`;
}

async function graphJson(url, token) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  const body = await response.text();
  let payload;
  try { payload = body ? JSON.parse(body) : {}; } catch { payload = {}; }
  if (!response.ok) throw new Error(payload.error && payload.error.message ? payload.error.message : `Microsoft Graph returned HTTP ${response.status}.`);
  return payload;
}

async function graphToken(env) {
  const tenant = text(env.MS_GRAPH_TENANT_ID);
  const clientId = text(env.MS_GRAPH_CLIENT_ID);
  const clientSecret = text(env.MS_GRAPH_CLIENT_SECRET);
  if (!tenant || !clientId || !clientSecret) throw new Error('Microsoft Graph read-only connection is not configured.');
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error('Microsoft Graph token request failed. Check the read-only app configuration.');
  return body.access_token;
}

function monthSheetName(date) {
  const value = parseSourceDate(date) || new Date().toISOString().slice(0, 10);
  const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)).toUpperCase();
  return `${month} ${value.slice(2, 4)}`;
}

export async function fetchSharePointB2w(env, targetDate) {
  const shareUrl = text(env.SHAREPOINT_B2W_SHARE_URL);
  if (!shareUrl) throw new Error('SharePoint B2W read-only link is not configured.');
  const token = await graphToken(env);
  const item = await graphJson(`${GRAPH_ROOT}/shares/${shareId(shareUrl)}/driveItem`, token);
  const driveId = text(item.parentReference && item.parentReference.driveId);
  const itemId = text(item.id);
  if (!driveId || !itemId) throw new Error('Microsoft Graph could not resolve the SharePoint B2W workbook.');
  const base = `${GRAPH_ROOT}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/workbook`;
  const sheets = await graphJson(`${base}/worksheets`, token);
  const sheetName = text(env.SHAREPOINT_B2W_SHEET) || monthSheetName(targetDate);
  const worksheet = (sheets.value || []).find((sheet) => text(sheet.name).toLowerCase() === sheetName.toLowerCase()) || (sheets.value || []).find((sheet) => /\b[A-Z]{3}\s+\d{2}\b/.test(text(sheet.name)));
  if (!worksheet) throw new Error(`The SharePoint workbook does not contain the ${sheetName} sheet.`);
  const range = await graphJson(`${base}/worksheets('${encodeURIComponent(text(worksheet.name))}')/usedRange(valuesOnly=true)`, token);
  const rows = parseB2wWorksheetValues(range.values || []);
  if (!rows.length) throw new Error(`No B2W quantity rows were found in the ${worksheet.name} sheet.`);
  return { rows, worksheet: text(worksheet.name), workbook: text(item.name) };
}
