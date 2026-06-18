# AGENTS.md - Meta Ads Monitoring Agent Engineering Guide

Direct mode. Concise, precise, high-signal.

## Product

Meta Ads Monitoring Agent is a read-only monitoring and reporting platform for local service-business Meta Ads campaigns.

Primary use cases:

- monitor campaign, ad set, and ad performance
- detect wasted spend
- detect rising CPL
- detect low CTR
- detect CPM spikes
- detect creative and audience fatigue
- detect scaling opportunities
- send Telegram reports and bot status updates

## Non-Negotiable Safety Rules

- Never pause campaigns automatically.
- Never edit budgets automatically.
- Never create ads automatically.
- Never delete ads automatically.
- Never modify campaigns, ad sets, or ads automatically.
- Recommendations must include problem, evidence, impact, and recommended action.
- Any future write action must require explicit human approval.
- Never log or expose Meta, Telegram, Supabase, or database secrets.

## Tech Stack

- Next.js App Router
- TypeScript strict mode
- PostgreSQL + Prisma
- Meta Marketing API
- Telegram Bot API
- Docker/Railway optional deployment support
- Tests via `tsx --test`

## Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run meta-ads:check-setup
npm run db:generate
npm run db:push
npm run meta-ads:daily
npm run meta-ads:weekly
```

## Required Env Vars

```env
DATABASE_URL=
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Optional:

```env
META_GRAPH_API_VERSION=v21.0
META_ADS_TIMEZONE=Asia/Kuala_Lumpur
META_ADS_DAILY_REPORT_TIME=08:00
META_ADS_RUN_SECRET=
TELEGRAM_WEBHOOK_SECRET=
```

## Module Map

- `lib/meta` - Meta Marketing API types, mapper, client
- `lib/meta-ads` - runner, setup checker, snapshots, baselines, status store
- `lib/ads-analysis` - rules, fatigue, recommendations
- `lib/reports` - daily and weekly report builders
- `lib/telegram` - Telegram client, status messages, command handling
- `scripts` - manual CLI runners
- `app/api/meta-ads` - status/setup/run API routes
- `app/api/telegram` - Telegram webhook
- `prisma/schema.prisma` - database schema
- `tests/meta-*` - Meta Ads module tests

## Git Rules

- Branch naming: `feat/*`, `fix/*`, `chore/*`
- Commit format: `type(scope): message`
- Never commit `.env`, secrets, logs, `.next`, or `node_modules`.
- Run typecheck, lint, tests, and build before pushing when feasible.
