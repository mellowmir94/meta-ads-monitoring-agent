const types = new Set(['epf', 'insurance', 'battery-tester', 'manual']);

// Statement formulas belong to one request/payment, independently of its plan schedule.
export async function savePaymentFormula(tx, input, actor, now) {
  if (typeof input.batchId !== 'string' || !input.batchId || input.batchId.length > 90) throw new Error('Choose a deduction request.');
  const records = []; let after = '';
  do {
    const page = [...await tx.list({ prefix: 'record:', limit: 500, ...(after ? { startAfter: after } : {}) })];
    for (const [, record] of page) if ((record.batchId || record.id) === input.batchId) records.push(record);
    after = page.length === 500 ? page.at(-1)[0] : '';
  } while (after);
  if (!records.length) throw new Error('Deduction request no longer exists. Refresh History.');
  if (input.rider !== undefined && records.some(record => record.rider.trim().toLowerCase() !== String(input.rider).trim().toLowerCase())) throw new Error('The selected request belongs to a different rider.');
  const period = {};
  if (input.periodStart !== undefined || input.periodEnd !== undefined) {
    for (const key of ['periodStart', 'periodEnd']) {
      const value = input[key];
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new Error('Choose a valid commission date range.');
      period[key] = value;
    }
    if (period.periodStart > period.periodEnd) throw new Error('Commission start date must precede end date.');
  }
  const active = records.filter(record => !['cancelled', 'rejected', 'reversed'].includes(record.status));
  const count = Math.max(0, ...active.map(record => record.installments?.length || 0));
  const index = input.paymentIndex;
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error('Choose a valid payment number for this request.');
  if (active.some(record => record.installments?.[index]?.completion?.state === 'completed')) throw new Error('Reopen completed installments before changing this payment formula.');
  if (!Array.isArray(input.lines) || input.lines.length > 4 || new Set(input.lines.map(line => line?.type)).size !== input.lines.length) throw new Error('Choose each deduction type at most once.');
  const lines = input.lines.map(line => {
    if (!types.has(line?.type)) throw new Error('Choose a valid deduction type.');
    const amount = String(line.amount ?? '');
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 1000000) throw new Error('Selected amounts must be RM0.01 to RM1,000,000, with up to two decimal places.');
    return { type: line.type, amountCents: Math.round(Number(amount) * 100) };
  });
  const owner = records.sort((a, b) => a.id.localeCompare(b.id))[0];
  const previous = owner.paymentFormulas?.[index] || null;
  if (input.expectedRevision !== (previous?.revision || 0)) throw new Error('This payment formula changed. Refresh History and review it before saving.');
  const formula = { paymentIndex: index, lines, ...period, revision: (previous?.revision || 0) + 1, savedAt: now, savedBy: actor.name };
  owner.paymentFormulas = { ...owner.paymentFormulas, [index]: formula };
  owner.audit = [...(owner.audit || []), { action: 'payment-formula-saved', installmentIndex: index, at: now, by: actor.name, role: actor.role, previousFormula: previous, formula }];
  owner.updatedAt = now;
  await tx.put('record:' + owner.id, owner);
  return { batchId: input.batchId, ownerId: owner.id, formula };
}
