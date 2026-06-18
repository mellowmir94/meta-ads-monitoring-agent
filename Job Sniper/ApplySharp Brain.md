# ApplySharp Brain

Obsidian-facing project brain for ApplySharp.

## Active Product

ApplySharp: AI-powered job search, JD scoring, truthful resume tailoring, and application tracking.

This replaces the older analytics SaaS direction in the project history. If files conflict, follow:

1. `AGENTS.md`
2. `README.md`
3. `PROJECT_SPEC.md`
4. `ARCHITECTURE.md`
5. This note
6. `[[Job Tracker]]`

## First User

- User: Amir
- Base location: Bukit Jelutong, Shah Alam, Selangor
- Search focus: Selangor first
- Preferred commute: 10-15km from Bukit Jelutong
- Quality rule: fewer stronger applications, no spray apply

## Main Flow

1. Upload or paste master resume.
2. Scan and parse the resume.
3. Search or add jobs by role, company type, location, source, pasted JD, or URL.
4. Analyze the JD.
5. Score fit against the master resume and commute preferences.
6. Decide `Strong Apply`, `Apply`, `Stretch Apply`, or `Skip`.
7. Tailor resume only for `Strong Apply` or `Apply`.
8. Generate cover letter and HR email draft.
9. User applies manually.
10. User confirms submission.
11. Tracker and resume version history update.

## Obsidian Links

- [[Job Tracker]]
- [[Master Resume]]
- [[JD Analysis/JD Analysis Template|JD Analysis Template]]
- [[Resume Versions/README|Resume Versions]]
- [[Cover Letters/README|Cover Letters]]
- [[Applied Jobs]]
- [[Archived Jobs]]

## Brain Command

When Amir says `/brain proceed project`:

1. Inspect files first.
2. Do not assume the latest state.
3. Read `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `README.md`, `TASKS.md`, and this note.
4. Choose the highest-impact unfinished task.
5. Make minimal focused changes.
6. Run relevant checks.
7. Report changed files, verification, unresolved risks, and next step.

## Current Product Priorities

1. Make first-user workflow reliable and simple.
2. Improve Selangor/Bukit Jelutong job discovery and commute scoring.
3. Improve JD analysis and truthful resume tailoring quality.
4. Add production auth/billing/storage hardening.
5. Add safe job ingestion connectors only after manual JD flow is strong.

## Hard Rules

- No fake skills.
- No fake tools.
- No fake years.
- No fake certifications.
- No fake companies.
- No fake achievements.
- No auto-submit.
- Do not mark applied until Amir confirms manual submission.

