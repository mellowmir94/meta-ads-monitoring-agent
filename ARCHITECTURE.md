# ApplySharp Architecture

## Purpose

This document defines the implementation boundaries for ApplySharp, the job search and resume tailoring SaaS described in `PROJECT_SPEC.md`.

ApplySharp is not an auto-apply bot. It is a decision, tailoring, and tracking system for high-quality job applications.

## Stack

- Framework: Next.js 15 App Router
- Language: TypeScript strict mode
- UI: Tailwind CSS
- Database: PostgreSQL
- ORM: Prisma
- Auth: Auth.js v5
- AI providers: OpenAI and Grok through an internal provider layer
- Billing: Stripe
- Rate limiting: Redis/Upstash with memory fallback
- File storage: local JSON/dev now, S3 or UploadThing for production
- Tests: Node native test runner with `tsx --test`

## High-Level Flow

```text
Browser
  -> Next.js pages/components
  -> Route handlers
  -> Service layer
  -> Repository/store layer
  -> local JSON in dev or Prisma/PostgreSQL in production

AI request
  -> User scope resolver
  -> Master resume evidence retrieval
  -> JD extraction/scoring
  -> Prompt safety checks
  -> AI provider abstraction
  -> JSON validation
  -> Metadata-only AiInteraction log
  -> Tailored resume/cover letter/email draft
```

## Core Boundaries

- `auth`: Auth.js session, dev fallback, user scope, admin authorization.
- `resumes`: master resume upload, parsing, source-of-truth profile evidence, resume version history.
- `jobs`: local catalog, pasted JD extraction, URL extraction, company/location/source metadata, scoring.
- `applications`: saved applications, status workflow, manual apply confirmation, deletion.
- `ai`: provider abstraction, prompt construction, strict JSON validation, deterministic fallback.
- `billing`: Stripe checkout, customer portal, webhooks, subscriptions, entitlements.
- `security`: middleware headers, request size limits, API rate limits, admin compatibility controls.
- `admin`: operational overview, readiness checklist, security posture.

## Source Of Truth Rules

The master resume is the only source for personal experience.

Tailoring can:

- rewrite
- reorder
- emphasize
- simplify
- add truthful ATS wording
- quantify only when supported

Tailoring cannot:

- invent skills
- invent tools
- invent years
- invent companies
- invent certifications
- invent achievements
- upgrade seniority beyond evidence

## User Scope And Tenancy

ApplySharp is multi-user ready.

Rules:

- Resolve user scope server-side for every protected route.
- Do not trust user IDs from client input.
- Use Auth.js session first.
- Use trusted dev header only when explicitly enabled.
- Use demo fallback only when auth is optional.
- Scope resumes, applications, AI logs, and subscriptions to the resolved user.

## Storage Modes

Development defaults:

- Master resumes: local JSON
- Applications: local JSON
- AI interactions: local JSON
- Subscriptions: local JSON

Production modes:

- Set the `APPLYSHARP_*_STORE` variables to `prisma`.
- Use PostgreSQL through Prisma.
- Use S3 or UploadThing for original file uploads.
- Use Redis/Upstash for distributed rate limiting.

## API Shape

Current core endpoints:

- `GET /api/health`
- `GET /api/master-resume`
- `POST /api/master-resume`
- `DELETE /api/master-resume?id=...`
- `POST /api/resumes/upload`
- `POST /api/resumes/parse`
- `POST /api/resumes/tailor`
- `POST /api/resumes/pdf`
- `POST /api/jobs/search`
- `POST /api/jobs/extract`
- `POST /api/jobs/analyze`
- `GET /api/applications`
- `POST /api/applications`
- `PATCH /api/applications/[id]`
- `DELETE /api/applications/[id]`
- `GET /api/resume-versions`
- `GET /api/ai/interactions`
- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `POST /api/billing/webhook`
- `GET /api/billing/subscriptions`
- `GET/POST /api/auth/[...nextauth]`

## Service Contracts

### Master Resume Service

Inputs:

- User scope
- Uploaded file or pasted text
- File metadata

Outputs:

- Active resume record
- Parsed profile evidence
- Skills/tools/projects/experience summary
- Warnings for unsupported parsing cases

### Job Extraction Service

Inputs:

- JD text or URL
- Source platform
- Optional user-provided company/location metadata

Outputs:

- Normalized job listing
- Required skills
- Preferred skills
- ATS keywords
- Salary/work-mode/source/freshness metadata
- Prompt-injection warnings

### Job Analysis Service

Inputs:

- User scope
- Master resume evidence
- Normalized job listing
- Location preference profile

Outputs:

- ATS match
- Technical match
- Domain match
- Seniority match
- Location match
- Freshness score
- Overall score
- Apply decision
- Missing skills
- Resume strategy

### Resume Tailoring Service

Inputs:

- User scope
- Master resume evidence
- JD analysis
- Apply decision

Outputs:

- ATS-safe tailored resume markdown/plain text
- Cover letter draft
- HR email draft
- Warnings for unverified keywords
- PDF download payload

Tailoring should be blocked or discouraged for `Skip` decisions.

## Security And Safety

- Rate-limit API requests.
- Enforce request size limits.
- Add browser security headers.
- Validate route input with schemas.
- Never expose stack traces in production responses.
- Do not log raw resume/JD text to AI interaction logs.
- Never auto-submit applications.
- Require user confirmation before marking an application as applied.

## UI Structure

Primary routes:

- `/`
- `/dashboard`
- `/account`
- `/admin`

Primary user surfaces:

- Master resume upload/paste
- Job search/filter panel
- JD paste/URL extraction panel
- Match score and decision panel
- Tailored resume editor
- Cover letter/email draft
- Application tracker
- Resume versions
- Map/commute links

## Verification

Before marking a functional change complete, run relevant checks:

```bash
npm run typecheck
npm test
npm run build
```

For UI changes, also smoke test in the browser when practical.

