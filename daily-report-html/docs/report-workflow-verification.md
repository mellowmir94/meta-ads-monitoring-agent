# Report Workflow Verification

Verified 4 September 2026.

Deployed build: `f1bdb76eaa50`, Worker version `93f7001d-4765-46e5-93cf-43ebd4fa2781`, published on 4 September 2026. This adds exact previous-calendar-day comparisons to the earlier pitstop-alert release `2be8c84eff91` (`de47f59c-03f6-42c0-943c-c5d706be8771`). Wrangler uses the owning `ba.sales@bateriku.com` account (`db5e583b9575a5c4371e50186e4e7f96`); the existing `DASHBOARD_DATA` namespace was retained. No replacement namespace was created.

Canonical and Bateriku alias `/api/health` checks return HTTP 200 with storage, Grafana configuration, login configuration and concurrency health all true. The authenticated Bateriku dashboard was reloaded and checked on the new release. Overview sales load, the Order-Daily schema error is gone, the full Summary readiness checklist renders, and report-version history loads its empty state without an error. No production report was finalised and no manual input was changed.

Direct read-only Grafana queries and the live Summary agree for the current selected dates:

| Date | B2C | B2B2C | Order-Daily All |
| --- | ---: | ---: | ---: |
| 1 Sep 2026 | 1,293 | 1,072 | 2,365 |
| 2 Sep 2026 | 1,083 | 852 | 1,935 |
| 3 Sep 2026 | 1,122 | 920 | 2,042 |

These are values observed on 4 September; Grafana may revise historical orders. The earlier 2 September fixture below remains the unmodified response captured on 3 September. The live Summary reports 5 of 9 checks ready. Full-report copy/finalisation correctly remain blocked by missing RSA/B2W inputs for 1-3 September and BGarage/Indonesia entries for 3 September. Those missing inputs were not replaced with fabricated zeroes.

Local preview: `http://127.0.0.1:8898`, started with Wrangler local mode and isolated persistence at `.wrangler/preview-workflow`. It has no production data or Grafana credentials. Summary and the empty report-version list were smoke-tested through the browser. Stop the local preview when no longer needed; it is not a production deployment.

## Data ownership

- Pitstop Master remains manual: active/closed locations, channel, tier and geography.
- HQ location sales use Grafana dashboard `6YM7jesvz`, panel 63.
- BP location sales use Grafana dashboard `-tqZjesvk`, panel 35.
- Overview daily sales and Summary's daily sales table use Grafana `oLOEK6sDz`, panel 54, query A.
- RSA, BGarage and Indonesia retain their manual entry workflow. B2W retains SharePoint sync plus explicit manual overrides.
- Saved BGarage and Indonesia values feed their dedicated tabs and the combined Summary for the same reporting date.

## Grafana parity

HQ/BP queries preserve the saved SQL, including its +8-hour timestamp expression, exclusions and location aliases. Report dates map to the saved dashboard's UTC clock; the end boundary is the following midnight, exclusive. The All branch-area selection uses the saved variable query. No archive or wider-window fallback substitutes sales.

Order-Daily uses its own saved SQL, status/category/dimension filters and null handling. It is a different metric scope from the detailed HQ/BP panels; differences between those two definitions are not overwritten to force agreement.

Live query results captured through the authenticated Grafana connector:

| Period | HQ Detailed | BP Detailed | Order-Daily All |
| --- | ---: | ---: | ---: |
| 23 Aug 2026 | 1,119 | 822 | 1,950 |
| 17-23 Aug 2026 | 7,425 | 5,701 | 13,203 |
| 1-23 Aug 2026 | 23,997 | 19,310 | 43,564 |

Tests compare the prepared HQ/BP SQL to the saved panel SQL and verify every returned location's sales survives normalization unchanged. Fixtures are evidence only, never application data.

The shared manual-master mapping reports raw Grafana, active-master, closed-master and unmatched totals separately. Unknown/ambiguous locations require Master review before copying a complete report. Tier targets remain 12, 9 and 7 per selected calendar day; green is at least 100%, yellow at least 90%, and red below 90%.

The current production Master was read without modification and reconciled against the captured Grafana rows: 283 Master records, 269 included locations, and zero unmatched sales for all three periods. Combined detailed sales reconcile to 1,941 / 13,126 / 43,307 respectively. HQ PRESINT 15 PUTRAJAYA appears once under Putrajaya; its sales are 26 / 151 / 430 and its targets 12 / 84 / 276. Penang labels are consistent. The separate BP PUTRAJAYA record remains under Selangor as classified in the manual Master; its name alone is not used to change geography. Evidence is in `artifacts/workflow/master-reconciliation.json`.

## Service calendar comparisons

RSA, B2W and ResQ chart changes use the immediately preceding calendar date, including the last day of the previous month/year. RSA now shows changes for its full breakdown as well as a selected type. RSA/B2W compare official saved values, never unsaved drafts or uploaded fallback values. ResQ queries include the preceding date. That context date is excluded from displayed-period totals and charts.

The same selected RSA types or ResQ states are summed for both dates. Missing prior fields produce `N/A`, not a partial total, fabricated zero or comparison with an older available day. Confirmed zero remains valid; a successful ResQ query with no cases on the preceding date means zero cases. Hover/accessible text identifies the exact prior date.

132 automated tests passed, including every month start, leap-year February, New Year, missing/partial values and zeroes. `scripts/verify-service-prior-day.mjs` verifies the real chart rendering with isolated August 31/September data, context fetching, totals, filtered series, fullscreen and mobile layouts; the full browser workflow also passed. Screenshots are `artifacts/workflow/service-prior-desktop.png`, `service-prior-fullscreen.png` and `service-prior-mobile.png`.

Live verification: September ResQ changes are -4, -4 and +2 for 1-3 September, with the first tooltip explicitly referencing 31 August. RSA and B2W lack complete saved 31 August inputs and therefore show `N/A` for 1 September; subsequent changes are +22/-5 (RSA) and +49/-32 (B2W). Selected totals remain RSA 141, B2W 195 and ResQ 21. No manual records were changed to manufacture a prior comparison. Both live health endpoints remain healthy.

## Save and refresh behavior

Summary and Pitstop Explorer now show a green normal status for reconciled pitstop sales. Missing or ambiguous Master matches show a red accessible alert with every affected name, excluded sales, match reason and a link to review Pitstop Master in Data Upload Centre. Zero-sales unmatched locations still require review even when total sales agree. Copy warnings remain separate, and the alerts are excluded from copied reports. Summary uses its independent network range; Explorer uses its selected range. This presentation change does not change mapping, sales, tier targets, or Master records.

Verification includes 128 passing automated tests and a successful full browser workflow run. Missing, ambiguous, zero-sales and long-name cases were injected only in the isolated test browser. Desktop/mobile screenshots are `artifacts/workflow/mapping-alert-desktop.png` and `artifacts/workflow/mapping-alert-mobile.png`; the restored clean state removes the alert. Both live health endpoints are healthy and the live Summary displays the new reconciled status. No production mismatch was created for testing.

- Refresh preserves the report window and reloads saved manual collections.
- Entry dates for BGarage/Indonesia are independent of the global report range.
- Drafts survive tab, date and in-page refresh changes. Unsaved edits are also stored in browser localStorage and offered for explicit recovery after a full reload. Recovery never saves official values. Existing revision checks remain in place.
- Only edited RSA/B2W fields are submitted. Partial successes are retained; failed edits remain drafts.
- Revision checks reject stale same-date/field saves. Review the newer values, then explicitly save again.
- Overwrite confirmations remain in place. A server-side audit records changed values, time, revision and writer type.
- Shared PIN authentication cannot identify an individual author; audit actor is dashboard user or SharePoint sync, not a personal identity.
- Missing/unavailable sources show N/A rather than invented zeroes. Copy is blocked for unsaved, unavailable or unreconciled sections.

## Storage and rollout

`MANUAL_VALUES` is a SQLite-backed Durable Object binding, with one serialized object per manual collection. Existing KV records are imported on first access; original KV keys remain untouched. Documents and large audit batches are chunked under per-value limits and committed atomically.

After migration, all manual writers, including SharePoint sync, use the Durable Object. Do not roll back to the old KV-only implementation without exporting the newer records: the legacy KV keys stop receiving updates.

Authenticated history endpoint: `/api/manual-values-history?kind=rsa` (also b2w, bgarage, indonesia), latest 100 saves.

## Readiness, drafts and finalised versions

The new full Summary readiness checklist has nine checks: Master, daily sales, HQ/BP mapping, RSA, B2W, ResQ, Warranty, BGarage and Indonesia. It uses the selected report dates and independent network dates. Review actions open the relevant editor/date or source section. Finalisation is disabled while sources are unavailable, entries are incomplete, mapping is unresolved, or edits remain unsaved.

Draft recovery is browser-local, not a server backup. It retains date, outlet/pitstop identity, original value and revision. The user can recover drafts, review individual fields, or discard one/all edits. Corrupt recovery entries are ignored and storage failures show a warning. Browser data clearing removes local recovery copies; use official saves and protected backups for durable retention. Shared-device users should not leave sensitive drafts behind.

`REPORT_VERSIONS` is an additive SQLite Durable Object binding, one archive per reporting date. Finalisation stores sanitized, inline-formatted report HTML, plain text, source/date metadata, manual values, Master mapping and report figures. Versions are append-only; a later version requires a reason. The server verifies the Master fingerprint and selected saved inputs before accepting the snapshot. It does not re-query Grafana or provide a transaction spanning all upstream systems: the version represents the reviewed report, not a claim that later-changing Grafana results can never differ.

The UI previews the report before finalisation and allows reading, copying and downloading old versions. A lost response can be retried with the same request ID without creating a duplicate. Content is frozen during that retry. Large snapshots are compressed and split below storage value limits in one transaction. HTML sanitization removes active content while preserving table styling and coloured circle glyphs. Anonymous access is rejected; existing shared-PIN authentication cannot attribute a version to a named individual. Finalisation sends no email and does not lock normal live editing.

The new tests use controlled data only. No production report was finalised, and no production manual value was changed.

## Order-Daily adapter correction

Authenticated inspection found the live error `Grafana Orders - Daily count schema changed`. A direct read-only query on 3 September confirmed that Grafana's saved query and `Total_count` field had not changed. The adapter normalized field names to lowercase but read `Total_count`; it also decoded channel B/C using the default A reference. The local fix reads `total_count` and passes each explicit response reference. Saved SQL, filters, date boundaries and tier rules are unchanged. The response cache schema is bumped to 6.

The response captured on 3 September for 2 September contains All 1,934, B2C 1,082 and B2B2C 852. Its frame schema/data is captured in `cloudflare/test/fixtures/order-daily-response-2026-09-02.json`; an end-to-end adapter test checks those exact figures and still rejects a missing frame or different metric. This is distinct from the detailed HQ/BP panel metric. The adapter correction and workflow features are now deployed; the fresh live comparison appears at the top of this document.

## Protected backups and recovery

Unlock Data Upload Centre, then use **Saved report backups** to select RSA, B2W, BGarage or Indonesia and download a JSON backup. Backup and restore routes require both dashboard access and the stronger Upload Centre authorization.

To recover, select the matching collection and original JSON file, then select **Preview restore**. The preview separates missing entries, identical existing entries and different existing entries. **Restore missing values** restores only absent entries: individual RSA fields, B2W dates, or complete BGarage/Indonesia daily reports. Existing values, including zeroes and newer reports, are never replaced. B2W retains SharePoint/manual provenance. If another session saves after the preview, restoration is rejected until the preview is repeated.

Files are size-limited, schema-validated and checksummed. The checksum detects accidental changes; it is not a digital signature or proof of who created a file. Keep downloaded backups private. Successful recovery uses the normal atomic storage/audit path with actor `backup-restore`. Repeating a completed recovery makes no further changes. Recovery was exercised only in the local Workers runtime, never against production report records.

Historical archive publishing no longer deletes the entire archive before uploading. Successful months are retained and skipped on retry within the same selection/session; failed or not-yet-published months resume. Only months present in the selected file are replaced. This is not a durable cross-browser job checkpoint, nor a fix for a separate Market Intelligence application.

## Outlook verification

A complete synthetic report was pasted into an unsent Outlook Web draft with no recipients, saved, and reopened. The test exposed hidden weekly tables reappearing after Outlook stripped their hidden styling. Clipboard output now physically omits collapsed sections; enabling weekly tables still includes all four ranking tables.

After the fix, the saved/reopened sample contains 16 tables, no hidden weekly sections, and matching report text (excluding Outlook's own table controls). Names/regions remain left-aligned, numbers centred, ordinary values regular-weight, and all three coloured achievement circles survive. The legend was visually checked for spacing and coloured circles. Draft title: `DO NOT SEND - Daily Report paste verification (sample data)`. No message was sent.

This validates Outlook Web, not every Outlook desktop version. Outlook may still adapt widths, fonts or wrapping to the viewing pane; pixel-identical rendering across clients is not guaranteed.

## Verification commands

```powershell
npm test
node scripts/verify-manual-store-runtime.mjs
$env:PLAYWRIGHT_MODULE_PATH='C:/Users/AmirKhalil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node scripts/verify-report-workflow.mjs
node scripts/verify-service-prior-day.mjs
node scripts/verify-backup-ui.mjs
node scripts/verify-master-reconciliation.mjs
npm run build
```

Browser tests cover all ten views, independent network filters, tier targets, saved-data propagation, preserved drafts, conflict review, partial saves, missing-data gates, clipboard HTML and desktop/mobile screenshots. New coverage includes full-reload recovery with no automatic writes, per-field discard, dated readiness links, revision reasons, archive preview/copy, unchanged historical content after live changes, and retry after a deliberately lost finalisation response. They use controlled API fixtures; live Grafana queries were verified separately.

Current local result: 132 automated tests passed; browser workflow, calendar-comparison browser checks and build passed again. Earlier backup UI, Wrangler dry-run and local Workers runtime checks passed. Runtime checks include large-record migration, simultaneous-save protection, protected backup routes, preview conflicts, missing-only recovery, audit records, authenticated report versions and compressed multi-chunk immutable storage. Backup UI checks cover actual downloads, invalid files, expired authorization, conflict review and desktop/mobile layouts.

After reauthentication, the current production Master was read again on 4 September and reconciled against the captured August Grafana evidence. It still contains 283 records with 269 included locations, no unmatched sales, one HQ Presint 15 record under Putrajaya, and consistent Penang labels. The 124 automated tests and build passed again before the successful deployment. Live read-only checks covered Overview, Summary sales/source health/readiness, and empty finalised-report history. Draft recovery and archive writes remain locally tested, not exercised by writing test data to production. No PIN or API token was requested in chat or recovered from credential files.
