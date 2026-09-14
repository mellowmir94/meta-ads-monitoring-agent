# Daily Report Dashboard HTML

This folder contains the standalone, single-file dashboard:

`dist/Daily Report Dashboard - Enhanced.html`

## Daily update

1. Open the HTML file in a modern browser.
2. Select **SharePoint Excel** and paste the SharePoint workbook link.
3. Update the SharePoint Excel workbook each day, then select the refresh button in the dashboard.
4. Select **Export report** to create a self-contained HTML snapshot for that day.
5. Upload the exported HTML to the SharePoint report folder or attach it to an Outlook email.

The SharePoint workbook should keep these tab names:

- `Daily Sales`
- `Pitstops`
- `BGarage`
- `Settings`

The dashboard supports date filters, overview trends, pitstop search and detail, BGarage sales and conversion performance, service and warranty views, SharePoint Excel loading, Excel import fallback, report export, and local browser persistence. The sample dataset is included as a fallback until new data is loaded.

The reusable implementation brief is in `SUGGESTED_PROMPT.md`.

## Build

From this folder:

```powershell
node .\build-html-report.mjs
```

The build creates the `dist` file and copies it to the current user's Desktop.
