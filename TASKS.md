# Meta Ads Monitoring Agent Tasks

## Current Priority

Finish runtime setup and first live run.

## Phase 1 - Core Agent

- [x] Meta API client
- [x] Telegram client
- [x] Prisma schema
- [x] alert rules
- [x] daily report generator
- [x] weekly report generator
- [x] run status storage
- [x] `/status` Telegram command handler
- [x] setup checker
- [x] tests

## Phase 2 - Runtime Setup

- [ ] create `.env`
- [ ] set `DATABASE_URL`
- [ ] run `npm run db:push`
- [ ] add `META_ACCESS_TOKEN`
- [ ] add `META_AD_ACCOUNT_ID`
- [ ] add `TELEGRAM_BOT_TOKEN`
- [ ] add `TELEGRAM_CHAT_ID`
- [ ] run `npm run meta-ads:check-setup`
- [ ] run `npm run meta-ads:daily`

## Phase 3 - Scheduling

- [ ] choose local scheduler or Railway Cron
- [ ] configure daily morning run
- [ ] configure optional 12-hour status/update run
- [ ] test failure notification

## Phase 4 - UI

- [x] rebrand dashboard to Meta Ads Monitoring Agent
- [ ] add live reports table
- [ ] add alerts table
- [ ] add latest run timeline
- [ ] add campaign/ad set/ad drilldown views

## Phase 5 - Production Hardening

- [ ] formal Prisma migrations
- [ ] secrets rotation checklist
- [ ] webhook setup guide
- [ ] Railway deployment validation
- [ ] optional LLM report summary provider abstraction
