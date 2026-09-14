# Suggested build prompt

Build a polished, standalone HTML dashboard for a manually updated daily operations report. The user must be able to open the HTML locally in a modern browser, upload one Excel workbook, review the complete report, apply filters, and export a self-contained HTML snapshot without a server or database.

Use a calm enterprise analytics design with a navy header, white data surfaces, compact responsive layout, and green as the primary accent. Prioritize fast scanning and daily usability. Avoid decorative effects, excessive animation, oversized cards, and generic dashboard clutter.

The Excel workbook must use these sheets:

1. `Daily Sales`: Date, B2C, B2B2C, RSA Jumpstart, RSA Tyre Patch, RSA Fuel, B2W, ResQ Selangor, ResQ JB, ResQ Pahang, ResQ Penang, Warranty 1st, Warranty 2nd, Warranty 3rd.
2. `Pitstops`: Channel, Name, Region, State, Tier, Target, Sales, Status.
3. `BGarage`: Date, Outlet, Daily Sales Target RM, Daily Actual Sales RM, MTD Actual Sales RM, Monthly Target, Special Cases Referred, Successful Conversions, Pick & Drop Cases, Daily Intake Actual, Daily Intake Target.
4. `Settings`: Benchmark, Report title.

Create four views:

- Overview: reporting-period sales KPIs, latest-day movement, average daily sales, target-hit days, action-location count, B2C/B2B2C trend chart, weakest locations, regional achievement, and service mix.
- Pitstop explorer: filter by status, channel, state, and text search; show outlet, tier, target, actual, achievement, status, variance, and a selected-location detail panel.
- BGarage performance: latest reporting-date sales KPIs, MTD achievement and shortfall, conversion and intake KPIs, status filters, outlet search, a sales table, and a conversion/intake table.
- Services and warranty: RSA, B2W, ResQ, warranty attend mix, and daily service-volume trend.

Calculate all derived fields in the browser. For pitstops, green means target met or exceeded, yellow means within 10% of target, and red means more than 10% below target. For BGarage, use Achieved for 100% or more, Near target for 80% to 99%, Below target for 60% to 79%, Critical for below 60%, and N/A when no target exists.

Provide date presets for 7 days, 14 days, and all dates, plus custom from/to dates. Include full loading, empty, and error states. Persist the latest successful upload in local browser storage. Include a Download template button that generates the correct Excel workbook and an Export report button that creates a standalone HTML file with the current data embedded and upload controls removed.

Keep the project maintainable with separate source HTML, CSS, and JavaScript files plus a build script that inlines the CSS, JavaScript, and Excel parser into one distributable HTML file. Validate JavaScript syntax, test Excel template download and re-upload, test every view and filter, confirm the browser console has no errors, and open the exported report to verify that its data is embedded.
