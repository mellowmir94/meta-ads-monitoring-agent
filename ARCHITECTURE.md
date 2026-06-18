# Meta Ads Monitoring Agent Architecture

## Purpose

Provide a production-ready, read-only monitoring system for Meta Ads performance.

The platform watches local service-business campaigns, detects issues and opportunities, and reports status to Telegram without making automatic changes to Meta Ads.

## High-Level Flow

```text
Scheduler / CLI / API trigger
  -> Meta Ads Agent Runner
  -> Meta Marketing API read-only client
  -> Snapshot normalization
  -> PostgreSQL via Prisma
  -> 7-day baseline calculation
  -> Analysis rules
  -> Daily/weekly report generation
  -> Telegram Bot API notifications
```

Telegram command flow:

```text
Telegram /status
  -> /api/telegram/webhook
  -> latest MetaAdsAgentRun
  -> Telegram status reply
```

## Core Boundaries

- `meta`: API client and Meta response normalization.
- `meta-ads`: orchestration, persistence, setup checks, run status.
- `ads-analysis`: deterministic alert rules.
- `reports`: human-readable daily and weekly Telegram reports.
- `telegram`: Bot API integration and command handling.

## Database

Core Prisma models:

- `MetaAdsAccount`
- `MetaAdsEntity`
- `MetaAdsPerformanceSnapshot`
- `MetaAdsAgentRun`
- `MetaAdsAlert`
- `MetaAdsReport`
- `MetaAdsRecommendedAction`

Historical snapshots are stored by account, entity, level, and date. Baselines are calculated from the previous 7 days.

## Read-Only Contract

Allowed:

- GET/list Meta campaigns, ad sets, ads, and insights.
- Store local analysis results.
- Send Telegram messages.

Forbidden:

- pause campaigns
- edit budgets
- create ads
- delete ads
- modify Meta objects

## Scheduling

Supported:

- manual CLI: `npm run meta-ads:daily`
- weekly CLI: `npm run meta-ads:weekly`
- HTTP trigger: `POST /api/meta-ads/run?type=daily`
- Railway Cron or another scheduler can call the HTTP route.

## Setup Validation

Use:

```bash
npm run meta-ads:check-setup
```

This reports missing config without printing secrets.
