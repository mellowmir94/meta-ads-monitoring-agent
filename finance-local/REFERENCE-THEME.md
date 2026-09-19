# Reference theme — local review only

## Brief

Finance staff use the existing Commission Rider dashboard to inspect commission and
download statements. Match the user's Bateriku Finance screenshots: lime active
navigation on olive-black, a calm rounded login card, and readable chart controls.
Keep the operational density, every table/filter, chart data and interactions intact.

The signature is the lime active navigation and the full olive-black finance palette.
All dashboard surfaces—including cards, filters, tables, history, deduction forms,
modals, states and chart chrome—use that shared palette. Semantic success, warning
and danger states retain distinct olive-compatible colours, and chart data series
retain their semantic colours for readability.

## Checkpoint

Git baseline: `c3398a8ef6f477dc48beedf74d33d85533f22ce5`.
Exact pre-edit files: `backups/reference-theme-20260919/`.
No deployment, data migration, authentication or queue changes.

## Files

- `bateriku-reference-theme.css`: isolated full-dashboard visual styles.
- `index.html`: branding text and generated theme style block.
- `cloudflare/public/index.html`: generated mirror.
- `scripts/build-audit-templates.cjs`: embeds stylesheet and existing PNG for offline use.
- `cloudflare/src/worker.js`: login CSS override only; no runtime logic changed.
- `scripts/check-reference-theme.cjs`: verifies presentation-only differences against checkpoint.
- `scripts/preview-reference-theme.cjs`: localhost-only login/before preview; refuses POST.

The existing login CSP blocks raster images. It remains untouched; the login keeps
its original text branding and PIN form rather than weakening security for a logo.
The sidebar reuses the existing Bateriku PNG. Its original file is not edited.

## Rollback

If no later work changed these four files, run from the repository root:

```powershell
Copy-Item -LiteralPath 'finance-local/backups/reference-theme-20260919/index.html' -Destination 'finance-local/index.html'
Copy-Item -LiteralPath 'finance-local/backups/reference-theme-20260919/public-index.html' -Destination 'finance-local/cloudflare/public/index.html'
Copy-Item -LiteralPath 'finance-local/backups/reference-theme-20260919/worker.js' -Destination 'finance-local/cloudflare/src/worker.js'
Copy-Item -LiteralPath 'finance-local/backups/reference-theme-20260919/build-audit-templates.cjs' -Destination 'finance-local/scripts/build-audit-templates.cjs'
```

If later edits exist, do not overwrite them: remove only the marked BATERIKU
REFERENCE THEME blocks, remove the theme embedding section in the build helper,
and restore the sidebar branding line from the checkpoint. The standalone new CSS
and this document can remain unused. No database/backend-logic rollback is needed.

## Validation

- Build embed and Wrangler `deploy --dry-run` passed. Nothing published.
- `node scripts/check-reference-theme.cjs` passed: all dashboard scripts and all
  other markup/style outside the new block/branding are identical to checkpoint;
  worker differs only by its marked login CSS block.
- Existing test suite: 231 passed, 6 failed. Read-only checkpoint comparison
  produces the same six failures (KPI neighbour placement, Reimbursement defaults,
  Reimbursement variables, Branch/HQ scope, hidden-tab filtering, large scopes).
- Desktop light/dark presentation and login desktop/phone inspected. Responsive
  dashboard DOM widths: 375px at 390px viewport and 805px at 820px viewport, with
  no document-level horizontal overflow. Preview console reported no errors.
- Independent design-loop visual review found no sidebar/login alignment defects.
  Narrow payout charts retain their existing horizontal scroll; some positive
  value labels require scrolling. Chart geometry was deliberately not changed.
- Login submission, live queue saturation, live PDF/Excel export and logout were
  not exercised: no live session/data changes were made. Their source is unchanged.
- No typecheck/lint scripts are configured for this standalone dashboard.

Local preview: run `node scripts/preview-reference-theme.cjs`, then visit
`http://localhost:4318/` or `/login`. `/before` serves the exact old dashboard.
All dashboard preview data is the application's existing local sample data.
