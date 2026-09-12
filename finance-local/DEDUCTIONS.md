# Commission Rider deduction register

The green Commission Deduction Formula works only when the current Line Item Audit table contains exactly one normalized `rider_name`. Finance may select multiple deduction types for that rider in one request. Each type is saved as an independent pending, auditable record; filtering never deducts commission.

Rules:

- EPF: hold RM25 on the actual payment date for the following month's EPF contribution. The selected commission period must be a full Monday–Sunday week. Creation and approval independently verify at least RM300 against fresh, all-filter Grafana Commission Rider rows; a browser-entered total never qualifies a rider. Maximum four active holds per rider per actual/planned payment month, and one active EPF deduction per rider and earned commission week, even when a payment date changes.
- Insurance: Finance enters the amount per payment; exactly two weekly payments are scheduled.
- OBD / Battery Tester: choose two weekly payments at RM50 each, seven weekly payments at RM40 each, or a one-off manual amount.
- Special Case: one-off amount entered by Finance.

Only applied installments reduce Net Commission. Pending and approved-but-not-applied records do not. Maker/checker actions and all changes are kept in Rider Deduction History. Applied records are corrected by reversal rather than deletion.

Records use the `DEDUCTIONS` Durable Object as the primary store and R2 as backup. Creator names remain self-declared while the application uses its shared PIN sign-in.

## Applying and correcting deductions

Approval does not apply money automatically. Applying requires an explicit zero-based `installmentIndex`, actual `paymentDate`, and `settlementPeriodStart` / `settlementPeriodEnd` identifying the earned Monday–Sunday commission week. The payment date and earned week are independent: last week's commission may be paid today. Future payment dates and installments not yet due are rejected. The installment and its audit entry preserve both dates, checker and amount. EPF must settle against the same earning week that was verified as eligible; its contribution month follows the actual payment month, not the earned week.

Reversing an explicit installment affects only that applied installment. A whole-plan reversal reverses applied installments and cancels the unapplied remainder, retaining original application events and a separate reversal history. There is no delete route.

`GET /api/deductions/eligibility?rider=...&periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD` returns `amountCents`, `rowCount`, `eligible`, the verified period, `source` and `verifiedAt`. It is read-only. Creation and approval reverify independently. Missing, truncated, mismatched, duplicated or malformed source data blocks EPF; failures never silently use a displayed or cached client total. A saved request's idempotency receipt remains replayable during an upstream outage.

## Recoverable backups

New R2 objects under `commission-rider/snapshots/v2/` contain a complete, checksummed Durable Object snapshot: records, installment history, audit, indexes, reference/revision counters and idempotency receipts. Existing older event-only objects are retained but are not accepted as complete recovery snapshots. Snapshot objects contain protected creator/session references needed for maker-checker recovery and must not be publicly exposed.

`cloudflare/src/deduction-backup.js` exports `createDeductionSnapshot`, `validateDeductionSnapshot`, and `restoreDeductionSnapshot`. Recovery validates SHA-256, storage keys, records, schedules and index references and only permits a new empty destination store. There is intentionally no live HTTP restore endpoint. Test restore in an isolated environment before any separately approved production cutover.

An R2 failure does not undo an already committed primary record: the API returns success with `backupStatus: "failed"` and a warning. Retrying the same request ID safely retries the snapshot without creating another deduction. A later successful complete snapshot also includes every earlier committed record.

The current complete-snapshot implementation uses Durable Object `storage.list()` without a limit, which returns all keys, rather than the 100-record paginated public history endpoint. It holds the snapshot in memory; as the register grows, monitor snapshot size and latency before introducing a separately tested streaming/incremental backup strategy. This is a known scale boundary, not an implied guarantee for arbitrarily large registers.

Deduction history Excel and PDF exports include the selected plan or EPF contribution month. The Line Item Audit PDF footer remains short and includes only applied deduction categories and Total Deducted.

## Validation

Run `node --test test/deductions.test.mjs test/deduction-integrity.test.mjs` from `finance-local/cloudflare`. Tests use an injected clock and synthetic Grafana responses; they never create production deductions or perform a live restore.
