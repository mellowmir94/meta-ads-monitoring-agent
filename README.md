# Meta Ads Monitoring Agent

Read-only Meta Ads monitoring platform for local service-business campaigns.

The agent pulls Meta Marketing API performance data, stores daily snapshots in PostgreSQL, compares current results against 7-day baselines, detects waste/fatigue/scaling opportunities, and sends Telegram reports plus bot status updates.

## Core Goal

Help a service business quickly know:

- which campaigns are working
- which campaigns are wasting money
- which ad sets or ads need attention
- what action to take next
- whether the bot ran successfully

## Safety Rules

- Read-only mode only.
- Never pause campaigns automatically.
- Never increase or decrease budgets automatically.
- Never create, edit, delete, or modify Meta campaigns/ad sets/ads.
- Recommendations are advice only.
- Any future write action must require explicit human approval.

## Current Platform Surface

- Next.js App Router backend/API surface
- TypeScript domain modules
- Prisma/PostgreSQL schema for Meta accounts, entities, snapshots, runs, alerts, reports, and recommended actions
- Meta Marketing API read-only client
- Telegram Bot API notification client
- Telegram `/status` command handler
- daily and weekly report generators
- alert rules for budget waste, CPL spikes, low CTR, high frequency, zero impressions, CPM spikes, fatigue, and scaling opportunities
- setup checker that reports missing configuration without printing secret values
- manual CLI runners
- Docker/Railway deployment scaffolding

## Required Environment Variables

Create `C:\Users\AmirKhalil\Documents\CC\.env`.

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

For Supabase Postgres, `DATABASE_URL` must start with `postgresql://`.

Do not use Supabase API keys such as `sb_secret_...`, anon keys, or service-role keys as `DATABASE_URL`.

## Commands

```bash
npm run meta-ads:check-setup
npm run db:generate
npm run db:push
npm run meta-ads:daily
npm run meta-ads:weekly
```

Local app:

```bash
npm run dev
```

Verification:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## API Routes

- `GET /api/meta-ads/setup` - safe setup status, no secret values
- `GET /api/meta-ads/status` - latest agent run status
- `POST /api/meta-ads/run?type=daily` - run daily report
- `POST /api/meta-ads/run?type=weekly` - run weekly report
- `POST /api/telegram/webhook` - Telegram webhook for `/status`

When `META_ADS_RUN_SECRET` is configured, send:

```http
x-meta-ads-run-secret: <META_ADS_RUN_SECRET>
```

## Telegram Output

The bot sends:

- run started
- daily or weekly report
- run completed
- run failed
- checked campaign/ad set/ad counts
- alert count
- report sent status

Manual Telegram command:

```text
/status
```

## Alert Rules

- Spend above RM100 and zero leads
- CPL 30% higher than previous 7-day average
- CTR below 0.8%
- Frequency above 4
- Active campaign/ad set with zero impressions
- Spend increased while leads dropped
- CPM increased by more than 30%
- Best campaign CPL below baseline
- Creative fatigue
- Audience fatigue
- Scaling opportunity
- Manual pause recommendation for underperformers

## Deployment Notes

Recommended cheap setup:

```text
Supabase Postgres
+ local laptop or Railway runner
+ Telegram Bot API
+ Meta Marketing API
```

Docker is optional. If local Docker is available:

```bash
npm run db:local:up
```

Local Docker database URL:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/meta_ads"
```

## Current Runtime Blocker

The app code is ready, but runtime secrets are still required:

- `.env`
- `DATABASE_URL`
- `META_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Run:

```bash
npm run meta-ads:check-setup
```

to see exactly what is missing.
