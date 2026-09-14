const schema = 'commission-rider-deductions';
const stable = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? '[' + value.map(stable).join(',') + ']' : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const recordStates = new Set(['pending', 'approved', 'applied', 'cancelled', 'rejected', 'reversed']);

export async function createDeductionSnapshot(storage, createdAt = new Date().toISOString()) {
  const entries = [...await storage.list()].sort(([left], [right]) => left.localeCompare(right));
  const payload = { schema, version: 2, revision: Number(await storage.get('counter:revision') || 0), createdAt, entries };
  return { ...payload, checksumSha256: await digest(payload) };
}

/** Offline validation only. The live dashboard deliberately has no restore endpoint. */
export async function validateDeductionSnapshot(snapshot) {
  if (!snapshot || snapshot.schema !== schema || snapshot.version !== 2 || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || !Number.isFinite(Date.parse(snapshot.createdAt)) || !Array.isArray(snapshot.entries)) throw new Error('Unsupported or incomplete deduction backup.');
  const { checksumSha256, ...payload } = snapshot;
  if (typeof checksumSha256 !== 'string' || checksumSha256 !== await digest(payload)) throw new Error('Deduction backup checksum mismatch.');
  const entries = new Map();
  for (const entry of snapshot.entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !/^(record:|request:|duplicate:|epf:|epf-week:|deleted:|counter:)/.test(entry[0]) || entries.has(entry[0])) throw new Error('Deduction backup contains invalid or duplicate storage keys.');
    entries.set(entry[0], entry[1]);
  }
  for (const [key, record] of entries) {
    if (!key.startsWith('record:')) continue;
    if (!record || key !== 'record:' + record.id || typeof record.rider !== 'string' || !record.riderKey || !recordStates.has(record.status) || !Number.isSafeInteger(record.amountCents) || record.amountCents <= 0 || !Array.isArray(record.audit) || !record.audit.length || !Array.isArray(record.installments) || record.installments.length !== record.installmentCount) throw new Error('Deduction backup contains an incomplete record.');
    if (record.installments.some((item, index) => !item || item.index !== index || !['scheduled', 'applied', 'reversed', 'cancelled'].includes(item.status))) throw new Error('Deduction backup contains an invalid installment schedule.');
  }
  for (const [key, value] of entries) {
    if (key.startsWith('duplicate:') || key.startsWith('epf-week:')) {
      if (typeof value !== 'string' || !entries.has('record:' + value)) throw new Error('Deduction backup has a broken index.');
    }
    if (key.startsWith('epf:') && (!Array.isArray(value) || value.some(id => !entries.has('record:' + id)))) throw new Error('Deduction backup has a broken monthly EPF index.');
    if (key.startsWith('deleted:') && (!value || value.batchId !== key.slice(8) || !Array.isArray(value.records) || !value.records.length || !Number.isFinite(Date.parse(value.deletedAt)) || !value.deletedBy)) throw new Error('Deduction backup has an invalid deletion audit record.');
  }
  if (Number(entries.get('counter:revision') || 0) !== snapshot.revision) throw new Error('Deduction backup revision mismatch.');
  return entries;
}

/** Recovery into a new, empty store only; existing records are never overwritten. */
export async function restoreDeductionSnapshot(storage, snapshot) {
  const entries = await validateDeductionSnapshot(snapshot);
  await storage.transaction(async tx => {
    if ((await tx.list({ limit: 1 })).size) throw new Error('Restore requires a new empty deduction store.');
    for (const [key, value] of entries) await tx.put(key, value);
  });
  return { revision: snapshot.revision, records: [...entries.keys()].filter(key => key.startsWith('record:')).length, entries: entries.size };
}
