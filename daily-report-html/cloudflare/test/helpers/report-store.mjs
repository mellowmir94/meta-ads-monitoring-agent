import { ReportVersionsStore, masterFingerprint, reportVersionsRequest } from '../../src/report-versions.js';

export const date = '2026-08-23';
export function makeManual() {
  const fields = ['totalLead', 'pendingLead', 'cancelledLead', 'baterikuJumpstart', 'baterikuCharge', 'baterikuWarranty', 'baterikuBattery', 'partnerJumpstart', 'partnerBattery'];
  return {
    rsa: { values: { [date]: { rsaJumpstart: 1, rsaTyrePatch: 2, rsaFuel: 0 } } },
    b2w: { values: { [date]: 0 } },
    bgarage: { values: { [date]: { rows: [{ outlet: 'Kajang', dailyTarget: 100, dailyActual: 90, mtdActual: 90, monthlyTarget: 3000, referrals: 1, conversions: 1, pickDrop: 0, intakeActual: 1, intakeTarget: 3 }] } } },
    indonesia: { values: { [date]: { daily: { pitstop: 'Cengkareng', ...Object.fromEntries(fields.map(field => [field, 0])) } } } }
  };
}

export function makeArchive(workbook = { data: { pitstopMaster: [{ Name: 'HQ TEST', Tier: 'Tier 1' }] } }, manual = makeManual()) {
  const objects = new Map();
  const env = {
    DASHBOARD_DATA: { get: async () => structuredClone(workbook) },
    MANUAL_VALUES: { idFromName: name => name, get: kind => ({ fetch: async () => Response.json(manual[kind]) }) }
  };
  env.REPORT_VERSIONS = { idFromName: name => name, get: key => {
    if (!objects.has(key)) {
      const data = new Map();
      const storage = {
        get: async key => structuredClone(data.get(key)),
        put: async (key, value) => data.set(key, structuredClone(value)),
        transaction: async run => {
          const before = structuredClone(data);
          try { return await run(storage); } catch (error) { data.clear(); before.forEach((value, key) => data.set(key, value)); throw error; }
        }
      };
      let tail = Promise.resolve();
      const ctx = { storage, blockConcurrencyWhile: run => { const result = tail.then(run); tail = result.catch(() => {}); return result; } };
      objects.set(key, { store: new ReportVersionsStore(ctx, env), data });
    }
    return objects.get(key).store;
  } };
  const call = (body, query = `date=${date}`, method = body ? 'POST' : 'GET') => reportVersionsRequest(new Request(`https://report.test/api/report-versions?${query}`, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) }), env);
  const payload = async () => ({
    requestId: crypto.randomUUID(), expectedLatest: 0, note: '', html: '<div><table width="800"><tr><th>Name</th><th>Achievement</th></tr><tr><td align="left">HQ TEST</td><td><font color="#43c98d">&#128994;</font></td></tr></table></div>', text: 'HQ TEST green',
    snapshot: { from: date, to: date, master: { fingerprint: await masterFingerprint(workbook.data || workbook) }, filters: { network: { from: date, to: date } }, manual: {
      ...Object.fromEntries(['rsa', 'b2w', 'bgarage'].map(kind => [kind, { [date]: structuredClone(manual[kind].values[date]) }])),
      indonesia: Object.fromEntries(Array.from({ length: 23 }, (_, day) => { const d = `2026-08-${String(day + 1).padStart(2, '0')}`; return [d, structuredClone(manual.indonesia.values[d] ?? null)]; }))
    } }
  });
  return { call, payload, env, objects, workbook, manual };
}
