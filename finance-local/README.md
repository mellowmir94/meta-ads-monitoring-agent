# Ledger Local Finance

Local-only Finance dashboard with focused visual tables, dummy data, and browser-only CSV upload.

## Current scope

- Commission Rider: 2 KPI cards, 1 chart, and 1 visual table.
- Reimbursement: 1 chart and 1 visual table.
- Daily Sales Finance overview only:
  - Branch overview full-width chart and visual table.
  - HQ & Dealer overview full-width chart and visual table directly below Branch.

The page now uses four Finance sidebar tabs:

- Commission Rider
- Reimbursement
- Daily Sales Finance - Branch Overview
- Daily Sales Finance - HQ & Dealer Overview

Each tab has its own local filters, chart, and table.

VChart is vendored locally and powers the Commission Pareto visual. The specialised reconciliation visuals retain their accessible native fallback renderers.

## Local filters mirrored from Grafana

- Commission Rider `_Qmhp4wHz`: branch, arrival status, order status, level, battery size, sales source, rider category.
- Reimbursement `XO4KTAeHk`: product, order status, order segment.
- Daily Sales Finance - Branch `zaFDBluHz`: payment method, brand, battery size, branch, product category.
- Daily Sales Finance - HQ & Dealer `qF-kJv9Hk`: payment method, brand, battery size, branch, product category.

Filters use compact finance-style boxes with date fields, dropdowns, search, and selected-value pills. They populate from dummy data or uploaded CSV columns, reset to All locally, and ignore missing CSV columns safely.

## Use on another laptop

1. Copy the whole `finance-local` folder to that laptop.
2. Open `index.html` in Chrome, Edge, or another modern browser.
3. Use the sidebar tabs to switch between the four Finance dashboards.
4. Click `Load dummy data` to populate every chart and table with sample rows.
5. To replace any panel, click `Upload CSV` inside that visual.
6. Click `Download sample CSV` inside a panel to get the expected headers for that visual.

The data stays in that browser only. Nothing is sent to Grafana, BigQuery, PostgreSQL, or the internet.

## Optional local server

You can open `index.html` directly. If you prefer a localhost URL:

```powershell
cd C:\Users\AmirKhalil\Documents\CC\finance-local
npm start
```

Then open `http://localhost:4317`.

No `.env` file is required for the current dummy/upload workflow.
