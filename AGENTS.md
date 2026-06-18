# AGENTS.md — ApplySharp AI Agent Engineering Guide

## Prompting Rules

Use the **CIIC framework** internally for every request:
- **Context** — Identify role, goal, audience, situation
- **Instructions** — Determine the exact task
- **Inputs** — Use all provided files, code, notes, examples
- **Constraints** — Follow formatting, tone, length, output requirements

If critical info is missing, ask clarifying questions first.

---

# Project Information

## Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 3.4
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** Auth.js v5 (GitHub, Google providers) + dev fallback
- **AI Providers:** OpenAI / Grok (abstracted behind provider layer)
- **Billing:** Stripe
- **Testing:** Node native test runner (`tsx --test`)
- **Linting:** ESLint + `next lint`
- **Package Manager:** npm

## Architecture

```
app/                    # Next.js App Router pages + API routes
  api/                  # Route handlers
  dashboard/            # Dashboard pages
  datasets/             # Dataset pages
  admin/                # Admin pages
components/             # Reusable React components
lib/                    # Domain services, stores, utilities
prisma/                 # Schema + migrations + seed
tests/                  # Unit tests
Job Sniper/             # Local markdown/static prototype (legacy)
```

## Core Modules
- **auth** — sign in/out, session, tenant/user resolution, RBAC
- **resumes** — master resume upload, parsing, profile extraction
- **jobs** — job search catalog, JD paste/URL extraction, analysis
- **applications** — tracker, status workflow, resume versions
- **ai** — orchestration, provider abstraction, prompt templates
- **billing** — Stripe checkout, portal, webhooks, subscriptions
- **security** — rate limiting, request size checks, admin tokens, audit logs

## Key Stores (Dev vs Production)
Each store has `local-json` (dev default) and `prisma` modes:
- `APPLYSHARP_MASTER_RESUME_STORE`
- `APPLYSHARP_APPLICATION_STORE`
- `APPLYSHARP_AI_INTERACTION_STORE`
- `APPLYSHARP_SUBSCRIPTION_STORE`

---

# Workflow

## Commands
| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |
| `npm test` | Run all tests (`tsx --test tests/*.test.ts`) |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run Prisma dev migrations |
| `npm run db:seed` | Seed database |

## Testing
- **Framework:** Node native test runner via `tsx`
- **Location:** `tests/*.test.ts`
- **Pattern:** `npm test` runs all `tests/*.test.ts` files
- Add tests alongside new features before marking complete

## CI Checks (required before push)
1. `npm run typecheck`
2. `npm run lint`
3. `npm test`
4. `npm run build`

---

# Code Conventions

## Naming
- **Files:** `kebab-case.ts` for utils, `PascalCase.tsx` for components
- **Folders:** `kebab-case`
- **Functions/Variables:** `camelCase`
- **Types/Interfaces:** `PascalCase` (types prefixed with `type`)
- **Enums:** PascalCase
- **Environment variables:** `UPPER_SNAKE_CASE`
- **Database models:** PascalCase (Prisma), `camelCase` for fields

## Imports
- Use `@/` alias for project root (configured in tsconfig paths)
- Group order: 1) External libraries 2) Internal `@/lib/*` modules 3) Types 4) CSS/assets
- No bare relative imports like `../../lib/` — use `@/lib/` instead

## Error Handling
- API routes: return `NextResponse.json({ error: string }, { status })`
- Services: throw typed errors or return `{ error }` objects
- Never expose stack traces in production responses
- Use security middleware (rate limits, payload size, admin tokens)

## AI Provider Pattern
- All AI calls go through the abstraction in `lib/ai-tailoring.ts`
- Never call OpenAI/Grok SDK directly in route handlers
- Responses must be strict JSON with validation
- All AI interactions logged to `AiInteraction` (metadata only, no raw PII)

## Critical Product Rules (NEVER violate)
1. **Never fake** skills, job history, certifications, salary, achievements, or experience
2. Only rewrite, reorganize, and optimize **truthful facts** from the master resume
3. Warn before adding unverified skills or keywords
4. Never auto-submit applications without user confirmation
5. Mark `applied` status only after manual submission confirmation

---

# Git Rules

- **Branch naming:** `feat/description`, `fix/description`, `chore/description`
- **Commit format:** `type(scope): message` (e.g., `feat(resume): add PDF upload`)
- Never commit directly to `main` — open a PR
- Never commit `.env`, `*.log`, `node_modules/`, `.next/`
- Always run typecheck + lint + tests before committing

---

# Environment & Configuration

**File:** `.env.example` documents all required vars.

Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_SECRET` — Auth.js encryption secret
- `OPENAI_API_KEY` / `GROK_API_KEY` — AI provider keys
- `AI_PROVIDER` — `"openai"` or `"grok"`
- `STRIPE_*` — Stripe keys for billing
- `APPLYSHARP_REQUIRE_AUTH` — set `"true"` to enforce Auth.js
- `APPLYSHARP_*_STORE` — `"local-json"` or `"prisma"`

**Security rules:**
- Never output real secrets, API keys, or tokens
- Never log raw resume text, JD text, or user PII
- In tests, use the `local-json` store mode

---

# Reference Docs

- `PROJECT_SPEC.md` — master product specification (read this for product context)
- `ARCHITECTURE.md` — technical architecture and data model
- `TASKS.md` — phased build goals (start from Goal 1)
- `README.md` — current MVP surface and production gaps

---

# What Makes an AI Agent Engineer (for ApplySharp)

1. **AGENTS.md** — this file, the agent's constitution
2. **Project scaffold** — consistent folder structure so the agent navigates predictably
3. **Testing** — always run tests after changes; write tests for new features
4. **Feedback loop** — review all agent output; use decision log below for major calls
5. **Iteration protocol** — one goal at a time per `TASKS.md`; verify before moving on
6. **Permission boundaries** — never install packages; never touch `.env`; never run destructive DB commands without asking
7. **Response style** — concise, action-oriented, reference files with line numbers

---

# Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| | | |

---
