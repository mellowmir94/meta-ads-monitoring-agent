# Commission Rider — local candidate

Build the rider settlement surface used by Finance after filtering a commission week to one rider. The decision is which deductions to request, which approved installments are due, and what remains payable. Preserve the existing Grafana-shaped ledger and the user's dark teal / green reference screenshots; this is an operational refinement, not a new dashboard brand.

## Binding design

- Keep the existing Segoe UI house typography. Use tabular numerals for money and dates, 12–14px controls, 16px section headings and 22–26px settlement totals. Long rider names wrap instead of disappearing in input boxes.
- Use the existing `--surface`, `--surface-strong`, `--text`, `--text-soft` and `--line` pairs for cards, fields and modal surfaces in both themes. Green is reserved for the settlement strip and applied state. Amber means pending or attention, never confirmed money.
- The signature is the ledger-style **Gross − Applied = Net** strip beneath four compact selectable deduction cards. Selected-request amounts are explicitly a preview, not an applied reduction.
- Use an 8px spacing rhythm, restrained borders and existing radii. The deduction header binds the rider to the commission period. History sits bottom left; the request action sits bottom right.
- The request dialog shows rider, period and gross as readable facts. Editable fields are amount, applicable plan, payment date, self-declared creator and remarks. Put payment schedule previews next to the decisions that control them.
- History prioritizes rider/reference, plan, applied/remaining amounts, next due date and status. Details expose the immutable audit trail without making every row excessively wide.
- At 768px and 390px, cards and form fields stack. Only the data table scrolls horizontally. Fullscreen contains the table toolbar and settlement controls, never the dashboard navigation overlaid on top.

## Self-audit

A generic redesign would add larger KPI cards and more color. This surface instead keeps the user's dense ledger, makes settlement arithmetic the visual anchor, and uses payment schedules as the supporting detail. Reuse the existing native dialog, buttons and filter primitives; introducing a React component library would add unnecessary complexity to this standalone app.

## Acceptance evidence

Capture normal/fullscreen, create request, history, blocked multi-rider, and service-error states. Check dark/light at desktop and the form at tablet/mobile. Run the same browser interactions with reduced motion. Review rendered screenshots independently before showing the candidate. Preview uses synthetic data and loopback-only storage; no GitHub push or deployment is authorized.
