# ApplySharp

AI-powered job search and resume tailoring SaaS.

ApplySharp helps users upload one master resume, parse it into a structured profile, search suitable jobs, analyze each JD, score fit and ATS strength, create truthful tailored resumes, generate cover letters and HR emails, and track applications.

## Current MVP Surface

- Next.js App Router dashboard with an interactive first-user workbench
- Master resume paste/upload for `.txt`, `.md`, `.docx`, and text-based `.pdf`
- Active master resume persistence with first-user local JSON mode and opt-in Prisma/PostgreSQL mode via `APPLYSHARP_MASTER_RESUME_STORE=prisma`
- Local Malaysia/Selangor job search catalog with role, location, category, work mode, and source filters
- Pasted JD or job URL extraction into normalized job listings with HR email, apply link, salary, requirements, responsibilities, ATS keywords, source platform, and prompt-injection warnings
- Bukit Jelutong commute metadata, location scoring, and Google Maps route links
- TypeScript domain service for resume parsing, JD scoring, prompt safety, truthful tailored resume assets, cover letters, HR email drafts, and confirmation-gated apply actions
- OpenAI/Grok-ready AI tailoring provider with strict JSON prompts, truth-only guardrails, prompt hashes, provider metadata, and deterministic fallback when keys are missing
- Metadata-only AI interaction logging for provider, model, prompt hash, fallback status, warnings, and output-size observability without storing raw resumes or JDs
- Server-generated ATS-safe PDF downloads using plain text and standard PDF fonts
- Server-backed application tracker persistence for job, fit score, tailored resume, PDF filename, cover letter, email draft, apply link, HR email, status, and status history
- Resume version history projected from saved application snapshots, including job context, score, PDF filename, cover letter state, and email draft state
- Application persistence repository with first-user local JSON mode and opt-in Prisma/PostgreSQL mode via `APPLYSHARP_APPLICATION_STORE=prisma`
- Tracker status controls for saved, tailored, downloaded, applied, interview, rejected, offer, and archived, plus confirmed deletion of saved application data
- Stripe-ready billing endpoints for subscription checkout, customer portal handoff, signed webhook handling, subscription status tracking, and entitlement summaries with local JSON fallback
- Auth.js route scaffold with Prisma adapter, conditional GitHub/Google OAuth providers, and session-first user-scope resolution for Prisma-backed resumes, applications, resume versions, subscriptions, and AI interaction logs
- Account page with configured OAuth provider sign-in buttons, sign-out action, and admin access status
- Role-gated admin page using Auth.js user scope plus `APPLYSHARP_ADMIN_EMAILS`, with first-user local fallback for demo mode
- Admin overview page for application counts, average fit score, pipeline status, source mix, recent applications, and production-readiness notes
- Middleware security hardening: Redis/Upstash-ready distributed API rate limits with memory fallback, request-size checks, browser security headers, and optional admin token compatibility
- Prisma schema for users, resumes, parsed profiles, jobs, analyses, tailored resumes, cover letters, applications, audit logs, AI logs, uploads, and Stripe subscriptions
- API routes:
  - `GET /api/applications`
  - `POST /api/applications`
  - `PATCH /api/applications/[id]`
  - `DELETE /api/applications/[id]`
  - `GET/POST /api/auth/[...nextauth]`
  - `GET /api/ai/interactions`
  - `GET /api/master-resume`
  - `POST /api/master-resume`
  - `DELETE /api/master-resume?id=...`
  - `GET /api/resume-versions`
  - `POST /api/billing/checkout`
  - `POST /api/billing/portal`
  - `POST /api/billing/webhook`
  - `GET /api/billing/subscriptions`
  - `GET /account`
  - `POST /api/resumes/parse`
  - `POST /api/resumes/upload`
  - `POST /api/resumes/pdf`
  - `POST /api/jobs/extract`
  - `POST /api/jobs/search`
  - `POST /api/jobs/analyze`
  - `POST /api/resumes/tailor`
- Browser-side editable tailored resume, cover letter, email draft, markdown/PDF downloads, apply/map actions, explicit post-submission applied marking, and saved application tracker
- Local markdown/static prototype under `Job Sniper/`

## Critical Product Rules

- Never fake skills, job history, certifications, salary, achievements, or experience.
- Only rewrite, reorganize, and optimize truthful facts from the master resume.
- Warn before adding unverified skills or keywords.
- Do not auto-submit applications without user confirmation.
- Opening an email or external apply channel prepares the application only; mark `applied` after manual submission.

## Intended Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma
- Auth.js
- OpenAI/Grok API
- Redis
- Stripe
- S3 or UploadThing
- Vercel

## Environment Variables

```env
DATABASE_URL=
AUTH_SECRET=
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
APPLYSHARP_ADMIN_TOKEN=
APPLYSHARP_ADMIN_EMAILS=
APPLYSHARP_MASTER_RESUME_STORE=local-json
APPLYSHARP_APPLICATION_STORE=local-json
APPLYSHARP_AI_INTERACTION_STORE=local-json
APPLYSHARP_SUBSCRIPTION_STORE=local-json
APPLYSHARP_DEMO_USER_EMAIL=founder@applysharp.local
APPLYSHARP_REQUIRE_AUTH=false
APPLYSHARP_TRUST_DEV_USER_HEADER=false
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
OPENAI_API_KEY=
GROK_API_KEY=
AI_PROVIDER=openai
AI_MODEL=
OPENAI_MODEL=
GROK_MODEL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
APPLYSHARP_RATE_LIMIT_NAMESPACE=applysharp
APPLYSHARP_RATE_LIMIT_FAIL_CLOSED=false
UPLOADTHING_TOKEN=
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

## Commands

## Meta Ads Monitoring Agent

Read-only Meta Ads monitoring for local service-business campaigns. The agent fetches Meta Marketing API performance data, stores daily snapshots in PostgreSQL, compares results with 7-day baselines, and sends Telegram daily/weekly reports plus bot status updates.

Safety rules:

- The agent is read-only.
- It never pauses campaigns.
- It never changes budgets.
- It never creates, edits, or deletes campaigns, ad sets, or ads.
- Pause/scale recommendations are advice only and require manual approval outside the agent.

Required environment variables:

```env
DATABASE_URL=
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Optional environment variables:

```env
META_GRAPH_API_VERSION=v21.0
META_ADS_TIMEZONE=Asia/Kuala_Lumpur
META_ADS_DAILY_REPORT_TIME=08:00
META_ADS_RUN_SECRET=
TELEGRAM_WEBHOOK_SECRET=
```

Manual runs:

```bash
npm run meta-ads:check-setup
npm run meta-ads:daily
npm run meta-ads:weekly
```

Local PostgreSQL with Docker:

```bash
npm run db:local:up
```

Use this local database URL:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/meta_ads"
```

Then apply the schema:

```bash
npm run db:generate
npm run db:push
```

Telegram status:

- The agent sends status messages when a run starts, completes, or fails.
- The Telegram webhook supports `/status`.
- Only the configured `TELEGRAM_CHAT_ID` receives command responses.

Scheduler options:

- Railway Cron can call `POST /api/meta-ads/run?type=daily`.
- Use header `x-meta-ads-run-secret: <META_ADS_RUN_SECRET>` when `META_ADS_RUN_SECRET` is configured.
- Weekly runs can call `POST /api/meta-ads/run?type=weekly`.

Meta lead counting:

- Default lead mapping counts Meta actions whose `action_type` contains `lead`.
- This covers common lead events but should be reviewed after the first live API response.

Production deployment:

1. Set all required environment variables in Railway.
2. Provision PostgreSQL and set `DATABASE_URL`.
3. Run `npm run db:generate`, then apply the schema with `npm run db:push` unless you create formal Prisma migrations first.
4. Deploy with the included `Dockerfile` and `railway.json`.
5. Configure Telegram webhook to point at `/api/telegram/webhook`.
6. Configure Railway Cron or an equivalent scheduler for the daily run endpoint.

```bash
npm run dev
npm run typecheck
npm test
npm run build
npm run db:generate
npm run db:migrate
npm run db:seed
```

## Production Gaps Still To Wire

- Production OAuth provider setup and branded sign-in/error pages
- Replace optional middleware admin token compatibility with Auth.js-only admin authorization
- OCR for scanned/image-only PDFs
- Provider cost/latency dashboards and alerting beyond current metadata-only AI interaction logs
- Production-grade job-board/company-page ingestion connectors beyond deterministic pasted JD/URL extraction
- Direct HR email sending with confirmation
- Stripe invoices and authenticated per-user entitlement enforcement beyond current billing portal/subscription summary support
- Provision production Redis/Upstash credentials and rate-limit alerting
- S3/UploadThing file storage
- External security review, secrets rotation policy, and deployment hardening
