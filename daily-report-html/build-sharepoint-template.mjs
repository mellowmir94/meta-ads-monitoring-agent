import fs from "node:fs/promises";
import vm from "node:vm";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const filled = process.argv.includes("--filled");
const outputPath = filled
  ? "C:/Users/AmirKhalil/Desktop/Daily Report Dashboard - SharePoint Filled Previous Data.xlsx"
  : "C:/Users/AmirKhalil/Desktop/Daily Report Dashboard - SharePoint Template.xlsx";
const headerFill = "#16324A";
const headerFont = { bold: true, color: "#FFFFFF" };
const border = { preset: "all", style: "thin", color: "#D9E3EA" };
const bodyFill = "#F7FAFC";

let seed = null;
if (filled) {
  const source = await fs.readFile("C:/Users/AmirKhalil/Documents/CC/daily-report-html/src/dashboard.js", "utf8");
  const match = source.match(/var seedPayload = ([\s\S]*?);\s*\n\s*var state =/);
  if (!match) throw new Error("Could not find the dashboard reference dataset.");
  seed = vm.runInNewContext(`(${match[1]})`);
}

function styleSheet(sheet, headerRange, bodyRange, widths) {
  sheet.showGridLines = false;
  sheet.getRange(headerRange).format = { fill: headerFill, font: headerFont, wrapText: true, horizontalAlignment: "center", verticalAlignment: "center", borders: border };
  sheet.getRange(bodyRange).format = { fill: bodyFill, borders: border, verticalAlignment: "center" };
  sheet.getRange(headerRange).format.rowHeight = 30;
  Object.entries(widths).forEach(([column, width]) => { sheet.getRange(`${column}1:${column}103`).format.columnWidth = width; });
  sheet.freezePanes.freezeRows(1);
}

function addInputTable(sheet, range, name) {
  const table = sheet.tables.add(range, true, name);
  table.showFilterButton = true;
  table.showBandedColumns = false;
  return table;
}

const workbook = Workbook.create();
const readme = workbook.worksheets.add("README");
const daily = workbook.worksheets.add("Daily Sales");
const pitstops = workbook.worksheets.add("Pitstops");
const bgarage = workbook.worksheets.add("BGarage");
const settings = workbook.worksheets.add("Settings");

readme.showGridLines = false;
readme.getRange("A1:F1").merge();
readme.getRange("A1").values = [["Daily Report Dashboard — SharePoint Excel input template"]];
readme.getRange("A1:F1").format = { fill: headerFill, font: { bold: true, color: "#FFFFFF", size: 14 }, verticalAlignment: "center" };
readme.getRange("A1:F1").format.rowHeight = 30;
readme.getRange("A3:B13").values = [
  ["Purpose", "Replace the input rows each day, save this workbook in SharePoint, and keep the sheet names and headers unchanged."],
  ["Required sheets", "Daily Sales, Pitstops, BGarage, Settings"],
  ["Date format", "Use real Excel dates or YYYY-MM-DD. The dashboard filters and sorts by date."],
  ["Blank values", "Use 0 for a measured zero. Leave WH blank only when WH is not included in the upload."],
  ["Channel values", "Use HQ and BP in the dashboard-facing template. B2C and B2B2C are also accepted for older files."],
  ["Pitstop status", "Optional: Green, Yellow, or Red. If blank, the dashboard calculates status from Sales ÷ Target."],
  ["Daily Sales", "One row per date. Includes HQ/BP/WH sales, RSA, B2W, ResQ, and warranty inputs."],
  ["Pitstops", "One row per pitstop. Region and State are separate fields; Tier should be Tier 1, Tier 2, or Tier 3."],
  ["BGarage", "One row per outlet and reporting date. Currency columns are numeric values, not text with RM."],
  ["Settings", "Set Benchmark and Report title. Benchmark is the daily total-sales target in units."],
  ["SharePoint", "Overwrite the same workbook in the agreed SharePoint folder. Do not rename sheets or columns."],
];
readme.getRange("A3:A13").format = { fill: "#DDEEF4", font: { bold: true, color: headerFill }, borders: border, verticalAlignment: "top" };
readme.getRange("B3:B13").format = { fill: "#F7FAFC", borders: border, wrapText: true, verticalAlignment: "top" };
readme.getRange("A1:A13").format.columnWidth = 24;
readme.getRange("B1:B13").format.columnWidth = 105;
readme.getRange("A3:B13").format.rowHeight = 28;
readme.freezePanes.freezeRows(2);

const dailyHeaders = [["Date", "HQ", "BP", "WH", "RSA Jumpstart", "RSA Tyre Patch", "RSA Fuel", "B2W", "ResQ Selangor", "ResQ JB", "ResQ Pahang", "ResQ Penang", "Warranty 1st", "Warranty 2nd", "Warranty 3rd"]];
const dailyData = filled
  ? seed.dayDates.map((date, index) => {
      const sales = seed.sales[index] || [];
      const rsa = seed.rsa[index] || [];
      const resq = seed.resq[index] || [];
      const warranty = seed.warranty[index] || [];
      return [date, sales[0] || 0, sales[1] || 0, null, rsa[0] || 0, rsa[1] || 0, rsa[2] || 0, rsa[3] || 0, resq[0] || 0, resq[1] || 0, resq[2] || 0, resq[3] || 0, warranty[0] || 0, warranty[1] || 0, warranty[2] || 0];
    })
  : [Array(15).fill(null), Array(15).fill(null)];
daily.getRange(`A1:O${dailyData.length + 1}`).values = [dailyHeaders[0], ...dailyData];
styleSheet(daily, "A1:O1", "A2:O103", { A: 15, B: 12, C: 12, D: 12, E: 17, F: 17, G: 14, H: 10, I: 16, J: 12, K: 15, L: 15, M: 14, N: 14, O: 14 });
daily.getRange("A2:A103").format.numberFormat = "yyyy-mm-dd";
daily.getRange("B2:O103").format.numberFormat = "#,##0";
addInputTable(daily, filled ? `A1:O${dailyData.length + 1}` : "A1:O103", "DailySalesInput");

const pitHeaders = [["Channel", "Pitstop", "Region", "State", "Tier", "Target", "Sales", "Status"]];
const pitData = filled
  ? seed.pit.map(row => [row[0] === "B2C" ? "HQ" : row[0] === "B2B2C" ? "BP" : row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7]])
  : [Array(8).fill(null), Array(8).fill(null)];
pitstops.getRange(`A1:H${pitData.length + 1}`).values = [pitHeaders[0], ...pitData];
styleSheet(pitstops, "A1:H1", "A2:H103", { A: 14, B: 30, C: 16, D: 18, E: 12, F: 12, G: 12, H: 12 });
pitstops.getRange("F2:G103").format.numberFormat = "#,##0";
pitstops.getRange("A2:A103").dataValidation = { rule: { type: "list", values: ["HQ", "BP", "B2C", "B2B2C"] } };
pitstops.getRange("E2:E103").dataValidation = { rule: { type: "list", values: ["Tier 1", "Tier 2", "Tier 3"] } };
pitstops.getRange("H2:H103").dataValidation = { rule: { type: "list", values: ["Green", "Yellow", "Red"] } };
addInputTable(pitstops, filled ? `A1:H${pitData.length + 1}` : "A1:H103", "PitstopInput");

const bgarageHeaders = [["Date", "Outlet", "Daily Sales Target RM", "Daily Actual Sales RM", "MTD Actual Sales RM", "Monthly Target", "Special Cases Referred", "Successful Conversions", "Pick & Drop Cases", "Daily Intake Actual", "Daily Intake Target"]];
const bgarageData = filled
  ? seed.bgarage.map(row => [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10]])
  : [Array(11).fill(null), Array(11).fill(null)];
bgarage.getRange(`A1:K${bgarageData.length + 1}`).values = [bgarageHeaders[0], ...bgarageData];
styleSheet(bgarage, "A1:K1", "A2:K103", { A: 15, B: 28, C: 20, D: 20, E: 20, F: 16, G: 20, H: 21, I: 18, J: 18, K: 18 });
bgarage.getRange("A2:A103").format.numberFormat = "yyyy-mm-dd";
bgarage.getRange("C2:F103").format.numberFormat = '"RM"#,##0.00';
bgarage.getRange("G2:K103").format.numberFormat = "#,##0";
addInputTable(bgarage, filled ? `A1:K${bgarageData.length + 1}` : "A1:K103", "BGarageInput");

settings.getRange("A1:B3").values = [["Setting", "Value"], ["Benchmark", 1935], ["Report title", "Daily Report Dashboard"]];
styleSheet(settings, "A1:B1", "A2:B3", { A: 22, B: 40 });
settings.getRange("B2").format.numberFormat = "#,##0";
addInputTable(settings, "A1:B3", "SettingsInput");

await fs.mkdir("C:/Users/AmirKhalil/Desktop", { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const summary = await workbook.inspect({ kind: "sheet,table", maxChars: 5000, tableMaxRows: 3, tableMaxCols: 8 });
console.log(summary.ndjson);
for (const sheetName of ["README", "Daily Sales", "Pitstops", "BGarage", "Settings"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`C:/Users/AmirKhalil/Documents/CC/${sheetName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-template-preview.png`, new Uint8Array(await preview.arrayBuffer()));
}
console.log(`Created ${outputPath}`);
