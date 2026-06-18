export function formatDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getYesterdayInTimeZone(timeZone: string, now = new Date()) {
  return addDays(formatDateInTimeZone(now, timeZone), -1);
}

export function dateTextToUtcDate(dateText: string) {
  return new Date(`${dateText}T00:00:00.000Z`);
}
