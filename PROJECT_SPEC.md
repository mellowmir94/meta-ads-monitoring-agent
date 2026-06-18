# Meta Ads Monitoring Agent Product Specification

## Product Goal

Build a read-only Meta Ads monitoring bot/platform for local service businesses.

The system helps the operator know:

- which campaigns are working
- which campaigns are wasting money
- which ads or ad sets need attention
- whether creative or audience fatigue is happening
- what action to take next
- whether the bot ran successfully

## Users

Primary user: owner/operator running Meta Ads for services such as:

- car seat cleaning
- sofa cleaning
- mattress cleaning
- car detailing
- other local service campaigns

## Monitoring Levels

- Campaign
- Ad Set
- Ad

## Metrics

- Spend
- Impressions
- Reach
- Clicks
- CTR
- CPC
- CPM
- Leads
- CPL
- Frequency

## Alert Rules

1. Spend > RM100 and leads = 0.
2. CPL is 30% higher than previous 7-day average.
3. CTR < 0.8%.
4. Frequency > 4.
5. Active campaign or ad set has 0 impressions.
6. Spend increased but leads dropped versus 7-day average.
7. CPM increased by more than 30%.
8. Best campaign has CPL lower than 7-day average.
9. Creative fatigue detected.
10. Audience fatigue detected.
11. Scaling opportunity detected.
12. Underperforming ad should be reviewed for manual pause.

## Telegram Reports

Daily report includes:

- Spend yesterday
- Leads
- Average CPL
- Best campaign
- Worst campaign
- Critical issues
- Warnings
- Good news
- Recommended actions

Every recommendation must include:

- Problem
- Evidence
- Impact
- Recommendation

## Bot Status Updates

The bot sends:

- run started
- run completed
- run failed
- checked entity counts
- alert count
- report sent status

Telegram command:

```text
/status
```

## Safety

The product is read-only. It must never perform automatic campaign modifications.

Any future write workflow must be approval-gated and auditable.
