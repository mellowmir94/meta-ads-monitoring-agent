import fs from 'node:fs';
import path from 'node:path';

const sourcePath = process.argv[2];
const outputPath = process.argv[3];
if (!sourcePath || !outputPath) throw new Error('Usage: node prepare-pitstop-history-kv.mjs <source.csv> <output.json>');
const sourceLabel = process.argv[4] || path.basename(sourcePath);

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      cells.push(value);
      value = '';
    } else value += character;
  }
  cells.push(value);
  return cells;
}

const lines = fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
const header = parseCsvLine(lines.shift()).map((value) => value.trim().toLowerCase());
const indexOf = (name) => {
  const index = header.indexOf(name);
  if (index < 0) throw new Error(`Missing ${name} column.`);
  return index;
};
const dateIndex = indexOf('date');
const channelIndex = indexOf('channel');
const pitstopIndex = indexOf('pitstop');
const stateIndex = indexOf('state');
const salesIndex = indexOf('sales');
const groups = new Map();
const seen = new Set();
let totalSales = 0;

for (const line of lines) {
  const cells = parseCsvLine(line);
  const row = {
    date: String(cells[dateIndex] || '').trim(),
    channel: String(cells[channelIndex] || '').trim().toUpperCase(),
    pitstop: String(cells[pitstopIndex] || '').trim(),
    state: String(cells[stateIndex] || '').trim(),
    sales: Number(cells[salesIndex] || 0)
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !['HQ', 'BP'].includes(row.channel) || !row.pitstop || !Number.isFinite(row.sales) || row.sales < 0) throw new Error(`Invalid historical row: ${line.slice(0, 160)}`);
  const uniqueKey = `${row.date}::${row.channel}::${row.pitstop.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
  if (seen.has(uniqueKey)) throw new Error(`Duplicate historical row: ${uniqueKey}`);
  seen.add(uniqueKey);
  const month = row.date.slice(0, 7);
  if (!groups.has(month)) groups.set(month, []);
  groups.get(month).push(row);
  totalSales += row.sales;
}

const now = new Date().toISOString();
const entries = [];
const monthItems = [];
for (const month of [...groups.keys()].sort()) {
  const rows = groups.get(month).sort((left, right) => left.date.localeCompare(right.date) || left.channel.localeCompare(right.channel) || left.pitstop.localeCompare(right.pitstop));
  const item = { month, rows: rows.length, from: rows[0].date, to: rows[rows.length - 1].date, totalSales: rows.reduce((sum, row) => sum + row.sales, 0) };
  monthItems.push(item);
  entries.push({ key: `pitstop-history:month:${month}`, value: JSON.stringify({ month, rows, rowCount: rows.length, from: item.from, to: item.to, totalSales: item.totalSales, sourceName: sourceLabel, uploadedAt: now }) });
}
const manifest = { sourceName: sourceLabel, uploadedAt: now, from: monthItems[0].from, to: monthItems[monthItems.length - 1].to, totalRows: lines.length, totalSales, months: monthItems };
entries.push({ key: 'pitstop-history:manifest', value: JSON.stringify(manifest) });
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(entries));
process.stdout.write(JSON.stringify({ outputPath, entries: entries.length, months: monthItems.length, from: manifest.from, to: manifest.to, totalRows: manifest.totalRows, totalSales: manifest.totalSales, bytes: fs.statSync(outputPath).size }, null, 2));
