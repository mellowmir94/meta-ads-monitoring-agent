const FORMAT = 'daily-report-manual-backup';
export const MANUAL_KINDS = ['rsa', 'b2w', 'bgarage', 'indonesia'];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const units = value => Number.isInteger(value) && value >= 0 && value <= 1000000;
const dateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

export async function digest(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createManualBackup(kind, current) {
  const record = { values: current.values || {} };
  for (const field of ['source', 'updatedAt', 'sharePointSyncedAt']) if (typeof current[field] === 'string') record[field] = current[field];
  if (kind === 'b2w') {
    record.manualOverrides = current.manualOverrides || (current.sharePointValues ? {} : current.values || {});
    record.sharePointValues = current.sharePointValues || {};
  }
  const backup = { format: FORMAT, version: 1, kind, exportedAt: new Date().toISOString(), record };
  return { ...backup, checksum: await digest(backup) };
}

export async function validateManualBackup(backup, kind, validateReport) {
  if (!object(backup) || backup.format !== FORMAT || backup.version !== 1 || backup.kind !== kind || !MANUAL_KINDS.includes(kind)) throw new Error('Choose an original backup for the selected collection.');
  const { checksum, ...content } = backup;
  if (typeof checksum !== 'string' || checksum !== await digest(content)) throw new Error('Backup checksum does not match. The file is damaged or was edited.');
  const record = backup.record;
  if (!object(record) || !object(record.values) || Object.keys(record.values).length > 15000) throw new Error('Backup records are invalid or exceed 15,000 dates.');
  for (const [date, value] of Object.entries(record.values)) {
    if (!dateKey(date)) throw new Error('Backup contains an invalid calendar date.');
    if (kind === 'rsa') {
      if (!object(value) || !Object.keys(value).length || Object.entries(value).some(([field, number]) => !['rsaJumpstart', 'rsaTyrePatch', 'rsaFuel'].includes(field) || !units(number))) throw new Error('Backup contains invalid RSA values.');
    } else if (kind === 'b2w' ? !units(value) : !validateReport(kind, value)) throw new Error('Backup contains invalid report values.');
  }
  if (kind === 'b2w') {
    for (const field of ['manualOverrides', 'sharePointValues']) {
      if (!object(record[field]) || Object.entries(record[field]).some(([date, value]) => !dateKey(date) || !units(value))) throw new Error('Backup B2W source records are invalid.');
    }
    if (canonical({ ...record.sharePointValues, ...record.manualOverrides }) !== canonical(record.values)) throw new Error('Backup B2W values do not match their source records.');
  }
  return record;
}

export function planMissingRestore(kind, current, incoming) {
  const pending = structuredClone(current), counts = { missing: 0, identical: 0, existingDifferent: 0 };
  pending.values ||= {};
  if (kind === 'b2w') {
    pending.manualOverrides ||= current.sharePointValues ? {} : { ...current.values };
    pending.sharePointValues ||= {};
  }
  const compare = (exists, before, after) => {
    if (!exists) counts.missing++;
    else if (canonical(before) === canonical(after)) counts.identical++;
    else counts.existingDifferent++;
    return !exists;
  };
  for (const [date, value] of Object.entries(incoming.values)) {
    if (kind === 'rsa') {
      const entry = pending.values[date] ||= {};
      for (const [field, number] of Object.entries(value)) if (compare(own(entry, field), entry[field], number)) entry[field] = number;
    } else if (compare(own(pending.values, date), pending.values[date], value)) {
      pending.values[date] = structuredClone(value);
      if (kind === 'b2w') {
        if (own(incoming.sharePointValues, date)) pending.sharePointValues[date] = incoming.sharePointValues[date];
        if (own(incoming.manualOverrides, date)) pending.manualOverrides[date] = incoming.manualOverrides[date];
      }
    }
  }
  if (!pending.source && incoming.source) pending.source = incoming.source;
  return { pending, counts };
}

export async function readBackupRequest(request, limitMb = 8) {
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw new Error('Backup request must be JSON.');
  const reader = request.body?.getReader(), chunks = [];
  if (!reader) throw new Error('Backup request is empty.');
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limitMb * 1024 * 1024) { await reader.cancel(); throw new Error('Request exceeds the ' + limitMb + ' MB limit.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('Backup request contains invalid JSON.'); }
}
