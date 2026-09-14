# Commission Rider deduction register

The green Commission Deduction Formula works only when the current Line Item Audit table contains exactly one normalized `rider_name`. Finance may select multiple deduction types for that rider in one request. Each type is saved as an independent, immediately applied, auditable record; filtering never deducts commission by itself.

Rules:

- EPF: one plan per rider/month, RM25 across four deductions (RM100 total) beginning in the current operating week, or the selected commission week when it is in the future. Thursday is the default. If the preceding Wednesday is a national public holiday on Malaysia's official government calendar, only that week's default moves to Friday; later dates return to Thursday. Payment 1 always reduces the original selected commission week by RM25 even when its date shifts to Friday; payments 2–4 reduce the weeks containing their configured dates. Finance can edit the four dates from History Details and move them across weeks or calendar months; dates must remain unique and chronological and every change is audited. The selected commission period must be a full Monday–Sunday week with at least RM300 recorded commission.
- Insurance: Finance enters the amount per payment; exactly two weekly payments are scheduled.
- OBD / Battery Tester: choose two weekly payments at RM50 each, seven weekly payments at RM40 each, or let Finance set the total and number of weekly payments.
- Special Case: Finance sets the total and number of weekly payments.

Only applied installments reduce Net Commission. Maker/checker actions and all changes are kept in Rider Deduction History. PIN-authorized deletion can remove any active History request while retaining a protected deletion tombstone.

Records use the `DEDUCTIONS` Durable Object as the primary store and R2 as backup. Creator names remain self-declared while the application uses its shared PIN sign-in.

## Applying and correcting deductions

The green panel's `Proceed` action applies every selected deduction immediately without a review dialog, then opens Rider Deduction History. The signed-in Finance name is recorded as the creator. History Details is the only editor for Finance-entered amounts, manual payment counts, payment dates and optional remarks. EPF remains fixed at RM25 × 4; Insurance remains fixed at two payments; fixed Battery Tester plans retain their prescribed amount/count unless changed to Manual. For EPF, payment 1 settles against the original commission week, while payments 2–4 settle against the Monday–Sunday weeks containing their configured dates. Details updates the record, settlement information and audit trail atomically.

Reversing an explicit installment affects only that applied installment. A whole-plan reversal preserves the original application events and adds a separate reversal history. PIN-authorized deletion removes the active request and leaves a tombstone for recovery and audit operations.

`GET /api/deductions/eligibility?rider=...&periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD` returns `amountCents`, `rowCount`, `eligible`, the verified period, `source` and `verifiedAt`. It is read-only. Creation and approval reverify independently. Missing, truncated, mismatched, duplicated or malformed source data blocks EPF; failures never silently use a displayed or cached client total. A saved request's idempotency receipt remains replayable during an upstream outage.

## Recoverable backups

New R2 objects under `commission-rider/snapshots/v2/` contain a complete, checksummed Durable Object snapshot: records, installment history, audit, indexes, reference/revision counters and idempotency receipts. Existing older event-only objects are retained but are not accepted as complete recovery snapshots. Snapshot objects contain protected creator/session references needed for maker-checker recovery and must not be publicly exposed.

`cloudflare/src/deduction-backup.js` exports `createDeductionSnapshot`, `validateDeductionSnapshot`, and `restoreDeductionSnapshot`. Recovery validates SHA-256, storage keys, records, schedules and index references and only permits a new empty destination store. There is intentionally no live HTTP restore endpoint. Test restore in an isolated environment before any separately approved production cutover.

An R2 failure does not undo an already committed primary record: the API returns success with `backupStatus: "failed"` and a warning. Retrying the same request ID safely retries the snapshot without creating another deduction. A later successful complete snapshot also includes every earlier committed record.

The current complete-snapshot implementation uses Durable Object `storage.list()` without a limit, which returns all keys, rather than the 100-record paginated public history endpoint. It holds the snapshot in memory; as the register grows, monitor snapshot size and latency before introducing a separately tested streaming/incremental backup strategy. This is a known scale boundary, not an implied guarantee for arbitrarily large registers.

Deduction history Excel and PDF exports include the selected plan or EPF contribution month. The Line Item Audit PDF footer remains short and includes only applied deduction categories and Total Deducted.

## Validation

Run `node --test test/deductions.test.mjs test/deduction-integrity.test.mjs` from `finance-local/cloudflare`. Tests use an injected clock and synthetic Grafana responses; they never create production deductions or perform a live restore.
