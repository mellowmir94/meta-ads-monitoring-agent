/* Read-only analysis over the complete loaded finance scope. No storage writes. */
(() => {
  const norm = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const label = value => String(value ?? '').replace(/[\r\n*`<>]/g, ' ');
  const money = cents => 'RM ' + (cents / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = (date, offset) => new Date(Date.parse(date + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  const typeNames = { epf: 'EPF', insurance: 'Insurance', 'battery-tester': 'Battery Tester', manual: 'Special Case' };
  const number = value => { const n = Number(String(value ?? '').replace(/RM|,/g, '').trim()); return Number.isFinite(n) ? n : 0; };
  function mapRecord(record) {
    const items = Array.isArray(record.installments) ? record.installments : [];
    return {
      id: record.id, reference: record.reference, rider: record.rider, type: record.type, status: record.status,
      amountCents: number(record.amountCents), installmentCount: record.installmentCount || items.length,
      periodStart: record.periodStart, periodEnd: record.periodEnd, reason: record.reason,
      createdBy: record.createdBy, createdAt: record.createdAt,
      payments: items.map((item, i) => ({ number: Number.isInteger(item.index) && item.index >= 0 ? item.index + 1 : i + 1, amountCents: number(item.amountCents ?? record.amountCents), dueDate: item.dueDate,
        status: item.status, paymentDate: item.paymentDate, settlementPeriodStart: item.settlementPeriodStart,
        settlementPeriodEnd: item.settlementPeriodEnd, statementSentAt: item.statementSentAt || '', completionState: item.completion?.state || '' }))
    };
  }
  function analyse({ question = '', records = [], rows = [], columns = [], today, dateRange = {}, search = '' }) {
    const q = norm(question), now = today || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const bm = !/\benglish\b/.test(q) && /\b(?:bm|bahasa melayu|berapa|siapa|senarai|senaraikan|jumlah|minggu|rekod|komisen|potongan|ansuran|ringkasan)\b/.test(q);
    const t = (english, malay) => bm ? malay : english;
    const identities = [...new Set([...records.map(r => r.rider), ...rows.map(r => r.rider_name)].filter(Boolean))];
    // Word boundaries prevent Rider 2 matching Rider 249. Longer names win over shorter aliases.
    const named = identities.filter(name => (' ' + q.replace(/[?!,;:]/g, ' ') + ' ').includes(' ' + norm(name) + ' ')).sort((a, b) => b.length - a.length);
    const reference = records.find(r => r.reference && (' ' + q.replace(/[?!,;:]/g, ' ') + ' ').includes(' ' + norm(r.reference) + ' '));
    const type = /\bepf\b/.test(q) ? 'epf' : /insurance|insurans/.test(q) ? 'insurance' : /battery|bateri|obd/.test(q) ? 'battery-tester' : /special case/.test(q) ? 'manual' : '';
    const matches = r => (!named.length || norm(r.rider || r.rider_name) === norm(named[0])) && (!search || norm([r.rider, r.rider_name, r.reference, r.reason].join(' ')).includes(norm(search)));
    let selected = records.filter(r => matches(r) && (!reference || r.id === reference.id) && (!type || r.type === type));
    let selectedRows = rows.filter(matches);
    const schedule = /payment|installment|ansuran|deduction|potongan/.test(q);
    const nextWeek = /next week|minggu (?:depan|hadapan)/.test(q), thisWeek = /this week|minggu ini/.test(q);
    const upcoming = /upcoming|akan datang/.test(q), overdue = /overdue|tertunggak/.test(q);
    const dateMatches = q.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
    let start = '', end = '';
    if (nextWeek || thisWeek) { const monday = day(now, -((new Date(now + 'T00:00:00Z').getUTCDay() + 6) % 7)); start = day(monday, nextWeek ? 7 : 0); end = day(start, 6); }
    else if (dateMatches.length && dateMatches.every(d => Number.isFinite(Date.parse(d)))) { start = dateMatches[0]; end = dateMatches[1] || start; }
    else if (/\btoday\b|hari ini/.test(q)) { start = end = now; }
    const fractions = [...q.matchAll(/\b(\d+)\/(\d+)\b/g)].map(m => [Number(m[1]), Number(m[2])]);
    const pending = /pending|belum|not sent|follow.up/.test(q);
    const payments = selected.filter(r => !['cancelled', 'rejected', 'reversed'].includes(r.status)).flatMap(r => mapRecord(r).payments.map(p => ({ ...p, rider: r.rider, reference: r.reference, id: r.id, type: r.type, count: r.installmentCount || r.installments?.length })))
      .filter(p => ['applied', 'scheduled'].includes(p.status) && (!start || p.dueDate >= start) && (!end || p.dueDate <= end) && (!upcoming || p.dueDate > now) && (!overdue || p.dueDate < now) && (!pending || !p.statementSentAt && p.completionState !== 'completed') && (!fractions.length || fractions.some(([i, n]) => p.number === i && p.count === n)))
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || String(a.rider).localeCompare(String(b.rider)));
    const summary = { savedRecordCount: records.length, matchingDeductionCount: selected.length, commissionRowCount: selectedRows.length,
      commissionCents: selectedRows.reduce((sum, r) => sum + Math.round(number(r.commission) * 100), 0), paymentCount: payments.length, paymentCents: payments.reduce((sum, p) => sum + p.amountCents, 0) };
    let answer = '', kind = 'deduction';
    if (schedule && (start || upcoming || overdue || pending || fractions.length)) {
      const matchingIds = new Set(payments.map(p => p.id));
      selected = selected.filter(r => matchingIds.has(r.id));
      const riders = new Set(payments.map(p => norm(p.rider))).size;
      answer = `**${payments.length.toLocaleString('en-MY')} ${t('matching installments', 'ansuran sepadan')}** ${t('for', 'untuk')} **${riders.toLocaleString('en-MY')} riders**, ${t('totalling', 'berjumlah')} **${money(summary.paymentCents)}**.\n\n${t('Period', 'Tempoh')}: ${start ? start + t(' to ', ' hingga ') + end : overdue ? t('Before ', 'Sebelum ') + now : upcoming ? t('After ', 'Selepas ') + now : t('All recorded dates', 'Semua tarikh direkodkan')} (${t('Malaysia calendar', 'kalendar Malaysia')}).`;
      if (pending) answer += '\n\n' + t('“Pending” here means the statement has not been marked sent to the rider. Applied deductions can still have an upcoming due date; this is not proof of an unpaid cash balance.', '“Pending” di sini bermaksud penyata belum ditandakan sebagai dihantar kepada rider. Potongan berstatus Applied masih boleh mempunyai tarikh akan datang; ini bukan bukti baki tunai belum dibayar.');
      if (payments.length) answer += '\n\n' + payments.map(p => `- **${label(p.rider)}** · ${label(typeNames[p.type] || p.type)} · Payment ${p.number}/${p.count} · ${label(p.dueDate)} · ${money(p.amountCents)} · ${label(p.status)} · ${p.statementSentAt ? 'Statement sent' : 'Statement not sent'} · ${label(p.reference)}`).join('\n');
      else answer += '\n\n' + t('No installments match this scope.', 'Tiada ansuran sepadan dengan skop ini.');
    } else if (/^(?:\d+[\s,]*riders?|how many riders?|berapa(?: jumlah)? riders?|jumlah riders?)[?. ]*$/.test(q)) {
      kind = 'commission';
      const count = new Set(rows.map(r => norm(r.rider_name)).filter(Boolean)).size;
      answer = t(`The current Commission Rider scope contains **${count.toLocaleString('en-MY')} unique rider names**, across **${rows.length.toLocaleString('en-MY')} commission rows**.`, `Skop Commission Rider semasa mengandungi **${count.toLocaleString('en-MY')} nama rider unik**, daripada **${rows.length.toLocaleString('en-MY')} baris komisen**.`);
      answer += '\n\n' + t('Period', 'Tempoh') + ': ' + (dateRange.start || t('Current selection', 'Pilihan semasa')) + (dateRange.end ? ' – ' + dateRange.end : '') + '. ' + t('This follows the current dashboard filters. Repeated rows for the same rider name count once; this is not the Deduction History record count.', 'Kiraan ini mengikut filter dashboard semasa. Nama rider berulang dikira sekali; ini bukan jumlah rekod Deduction History.');
    } else if (/highest|ranking|top\s*\d*|tertinggi/.test(q) && /commission|komisen/.test(q)) {
      kind = 'commission';
      const groups = new Map();
      selectedRows.forEach(r => { const key = norm(r.rider_name || 'Unnamed rider'); const item = groups.get(key) || { rider: r.rider_name || 'Unnamed rider', cents: 0 }; item.cents += Math.round(number(r.commission) * 100); groups.set(key, item); });
      const ranked = [...groups.values()].sort((a, b) => b.cents - a.cents);
      const requested = q.match(/top\s+(\d+)/), limit = requested ? Math.max(1, Number(requested[1])) : /all|semua/.test(q) ? ranked.length : 10;
      answer = `Commission ranking calculated from **all ${selectedRows.length.toLocaleString('en-MY')} matching rows** in ${dateRange.start || 'the selected period'}${dateRange.end ? ' to ' + dateRange.end : ''}.\n\n` + ranked.slice(0, limit).map((r, i) => `${i + 1}. **${label(r.rider)}** · ${money(r.cents)}`).join('\n');
    } else if (/^(?:how many (?:rider )?deduction(?: history)? records(?: are (?:there|available))?|berapa (?:jumlah )?(?:rekod )?(?:rider )?deduction history|jumlah rekod)[?. ]*$/.test(q)) {
      answer = t(`Rider Deduction History currently contains **${records.length.toLocaleString('en-MY')} saved records**.`, `Rider Deduction History kini mempunyai **${records.length.toLocaleString('en-MY')} rekod tersimpan**.`);
    } else if (/summari[sz]e|summary|ringkasan|total commission|jumlah komisen/.test(q) && /commission|komisen/.test(q)) {
      kind = 'commission'; answer = `Current Commission Rider scope: **${selectedRows.length.toLocaleString('en-MY')} rows**, with **${money(summary.commissionCents)}** total commission.\n\nPeriod: ${dateRange.start || 'Current selection'}${dateRange.end ? ' to ' + dateRange.end : ''}.\n\nRider Deduction History contains **${records.length.toLocaleString('en-MY')} saved records** across the complete register. Commission total is before any separate deduction calculation.`;
    }
    return { answer, kind, summary, records: selected.map(mapRecord), rows: selectedRows, matchedIds: selected.map(r => r.id), start, end, today: now };
  }
  window.LedgerFinSightData = { analyse, mapRecord };
})();
