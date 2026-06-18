# ApplySharp Phased Goals

Use one short `/goal` or `/brain proceed project` request at a time. Codex should read `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `README.md`, and `Job Sniper/ApplySharp Brain.md` before choosing work.

## Brain Command

When the user says:

```text
/brain proceed project
```

Do this:

1. Inspect existing files first.
2. Confirm ApplySharp is the active product.
3. Check root docs and the `Job Sniper` Obsidian notes.
4. Pick the highest-impact unfinished task.
5. Make focused changes only.
6. Run relevant checks.
7. Summarize what changed, verification, and next step.

## Goal 1 - First-User Workflow

```text
/goal Make the ApplySharp first-user workflow reliable: master resume upload, JD analysis, score, truthful tailoring, PDF download, manual apply confirmation, and tracker persistence.
```

Status: largely implemented. Keep improving practical usability before adding broad automation.

## Goal 2 - Malaysia Job Discovery

```text
/goal Improve Malaysia/Selangor job discovery around Bukit Jelutong with practical filters, distance scoring, source tracking, freshness, company type, and safe JD extraction.
```

Priority:

- Better job source ingestion without violating site restrictions.
- Clear manual add/paste workflow.
- Company type and location classification.
- Commute/map UX for Selangor-first search.

## Goal 3 - AI Quality Layer

```text
/goal Improve AI JD analysis and resume tailoring quality with strict JSON validation, truth-only evidence checks, ATS keyword warnings, model fallback, and interaction observability.
```

Priority:

- Better missing-skill warnings.
- Better prompt-injection handling.
- Provider cost/latency metadata.
- Test fixtures for weak, stretch, and strong roles.

## Goal 4 - Production Auth, Billing, And Storage

```text
/goal Finalize production account readiness with OAuth branding, Stripe entitlement enforcement, PostgreSQL stores, S3/UploadThing upload storage, and secure user isolation.
```

Priority:

- Branded sign-in/error pages.
- Entitlement enforcement in product routes.
- File storage beyond local JSON.
- Prisma production verification.

## Goal 5 - Sellable Product Polish

```text
/goal Polish ApplySharp into a sellable MVP with clean onboarding, empty states, mobile usability, admin readiness, deployment docs, and demo-safe seed data.
```

Priority:

- Simpler onboarding.
- Better first-run guidance.
- Better resume upload confidence.
- Better tracker clarity.
- Mobile layout checks.

## Current Recommended Next Tasks

1. Add S3/UploadThing-ready original resume file storage.
2. Add OCR path for scanned/image-only PDFs.
3. Add branded Auth.js sign-in/error pages.
4. Add production entitlement checks around premium AI/PDF actions.
5. Add safer job ingestion connectors after the manual JD workflow is excellent.

## Required Checks

Run the relevant subset before marking work complete:

```bash
npm run typecheck
npm test
npm run build
```

## Rules

- Never fabricate resume content.
- Never auto-submit applications.
- Keep changes focused and minimal.
- Prefer practical first-user value over broad generic features.
- Do not let old analytics SaaS docs override ApplySharp direction.

