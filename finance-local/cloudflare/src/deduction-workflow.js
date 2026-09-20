// Independent reconciliation metadata: never changes deduction amounts or application status.
export const installmentCompleted = item => item?.status === 'applied' && item?.completion?.state === 'completed';
export function batchStage(records) {
  const active = records.filter(record => !['cancelled', 'rejected', 'reversed'].includes(record.status));
  if (!active.length) return 'inactive';
  const items = active.flatMap(record => record.installments || []).filter(item => !['cancelled', 'reversed'].includes(item.status));
  if (!items.length) return 'inactive';
  return items.every(installmentCompleted) ? 'completed' : 'active';
}
export function installmentMatches(item, index, count, scope) {
  if (['cancelled', 'reversed'].includes(item.status)) return false;
  const value = scope.installment || '';
  if (value === 'single' && count !== 1 || value === 'awaiting' && (item.status !== 'applied' || installmentCompleted(item)) || value === 'completed' && !installmentCompleted(item) || value === 'first' && index !== 0 || value === 'later' && index < 1 || value === 'final' && index !== count - 1 || /^exact:\d+$/.test(value) && index + 1 !== Number(value.split(':')[1])) return false;
  if (scope.month && !String(item.dueDate || '').startsWith(scope.month + '-')) return false;
  if (scope.dueStart && item.dueDate < scope.dueStart || scope.dueEnd && item.dueDate > scope.dueEnd) return false;
  return true;
}
