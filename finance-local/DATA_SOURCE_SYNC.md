# Commission Rider data source

Open **More (three dots) → Data Source settings**.

- **Live data ON** keeps the live Grafana path.
- **Sync now** explicitly fetches the selected full Monday–Sunday week, including both independent KPI sources.
- **Live data OFF** serves saved weekly data to the dashboard, templates and statement exports. No automatic fallback to Grafana is allowed. Unsynced or partial-week requests show an error.
- Saved KPI cards are full-week totals; local table filters do not approximate the independent KPI queries.
- **Use this week** selects the date range. Re-syncing replaces that week's successful pointer only after validating and storing the full response.

The application currently authenticates shared PIN roles rather than named individual accounts. Mode preferences are therefore isolated by authenticated session, survive reloads, and default to ON for a new login. Snapshots are shared by all Finance sessions.

## Storage and recovery

The existing DeductionRegister stores `sync-week:` metadata and `sync-pref:` preferences. Immutable payloads are stored in the existing backup bucket under `commission-sync/v1/`. Register snapshots include the week pointers. Retain both the register backups and referenced immutable payload objects during backup/restore; never prune payloads that a retained register backup references.

Failed fetches, missing KPIs and truncated/mismatched row counts never replace a successful week. Concurrent syncs for the same week share an in-flight promise in the singleton Durable Object.

## Verification

- `node --test finance-local/cloudflare/test/data-source.test.mjs`
- `node finance-local/scripts/verify-data-source.cjs` (Playwright; `TEST_BROWSER_CHANNEL=msedge`)
- `SYNC_MODE=1 node finance-local/scripts/verify-history-download.cjs` (PowerShell: set `$env:SYNC_MODE='1'`)
- `node finance-local/scripts/build-audit-templates.cjs`
- Wrangler deploy dry-run, followed by deployment only with the owning Cloudflare account.

The broader existing suite has 14 unrelated failures reproduced against the previous committed dashboard/worker sources. Focused sync, source-switching, backup, startup and real PDF/Excel delivery tests pass.
