# ApplySharp Product Specification

## Product Vision

ApplySharp is an AI-powered job search and resume tailoring SaaS for targeted applications.

The product helps a user upload one master resume, find suitable jobs, analyze each job description, score fit, tailor a truthful ATS-safe resume, draft supporting application assets, and track the application pipeline.

The first user is Amir, based in Bukit Jelutong, Shah Alam, Selangor. The first market focus is practical Malaysia job hunting, starting with Selangor roles within roughly 10-15km where possible.

## Core Principle

Do not spray applications.

Every job must be analyzed first. Apply only when the job is suitable, recent enough, practical to commute to, and supported by truthful resume evidence.

## Non-Negotiable Rules

- Never fake skills, tools, years of experience, companies, certifications, salary, seniority, or achievements.
- Only rewrite, reorganize, and emphasize true facts from the master resume.
- Warn when a job asks for skills that are missing or weak.
- Never auto-submit an application.
- Mark an application as applied only after the user confirms manual submission.
- Prefer fewer high-quality applications over many weak applications.

## Target User Flow

1. User uploads or pastes a master resume.
2. System parses the resume into structured profile evidence.
3. User searches or adds jobs by keyword, company type, location, source, pasted JD, or URL.
4. System extracts job details and JD requirements.
5. System scores the job against the master resume and user location preferences.
6. System decides `Strong Apply`, `Apply`, `Stretch Apply`, or `Skip`.
7. If worth applying, system creates a truthful resume tailoring plan.
8. System generates a job-specific ATS-safe resume, cover letter, and HR email draft.
9. User manually applies through JobStreet, Indeed, LinkedIn, company site, or email.
10. User confirms submission, then the tracker moves the job to applied.
11. System tracks follow-up, interview notes, rejection/archive, and resume versions.

## First-User Malaysia Defaults

- Base location: Bukit Jelutong, Shah Alam, Selangor.
- Primary search area: Selangor first.
- Preferred commute: 10-15km from Bukit Jelutong.
- Strong areas: Shah Alam, Glenmarie, Subang Jaya, Ara Damansara.
- Selective areas: Kelana Jaya, Petaling Jaya, Damansara, Kota Damansara, Setia Alam.
- Kuala Lumpur: only hybrid, remote, or high-value roles.
- Currency: MYR.
- Sources: JobStreet, Indeed, LinkedIn, company sites, referrals, recruiters.

## Best-Fit Roles

- Data Analyst
- Business Analyst
- Reporting Analyst
- Dashboard Analyst
- Power BI Analyst
- SQL Analyst
- BigQuery Analyst
- Grafana / Monitoring Analyst
- Data Operations
- Application Support
- IT Operations
- System Support
- Junior Developer
- Laravel / PHP Support
- Python Automation
- Reporting Automation

## Job Tracking Fields

- No
- Date Found
- Job Title
- Company
- Company Type
- Location
- Distance KM
- Work Mode
- Source
- Job Freshness
- Salary Range
- Seniority Level
- Required Skills
- Preferred Skills
- ATS Keywords
- Missing Skills
- Match Score
- ATS Score
- Location Score
- Freshness Score
- Resume Tailored
- Application Status
- Priority
- Apply Decision
- Notes

## Company Types

- MNC
- SME
- Startup
- Agency / Recruiter
- GLC / Government
- Other

## Status Workflow

- Found
- Reviewed
- Resume Tailored
- Applied
- Follow-up
- Interview
- Rejected
- Archived

## Scoring

Freshness:

| Freshness | Score |
|---|---:|
| Today | 100 |
| 1-3 days | 90 |
| 4-7 days | 70 |
| 8-14 days | 50 |
| 15+ days | 25 |

Distance:

| Distance / Mode | Score |
|---|---:|
| Remote | 100 |
| 0-10km from Bukit Jelutong | 100 |
| 10-15km from Bukit Jelutong | 95 |
| Hybrid within 15km | 95 |
| Onsite within 15km | 90 |
| 16-25km | 65 |
| 26-30km | 50 |
| 31-50km | 25 |
| 50km+ | Skip unless remote or exceptional value |

Decision:

| Score | Decision |
|---:|---|
| 90-100 | Strong Apply |
| 80-89 | Apply |
| 70-79 | Stretch Apply |
| Below 70 | Skip |

Seniority:

- Entry: good if role is a learning or graduate role.
- Junior: strong fit if skills match.
- Mid: apply only if skills match is at least 70%.
- Senior: stretch only if the JD clearly matches proven experience.
- Lead / Manager: skip unless explicitly suitable.

## JD Analysis Output

For each JD, output:

```markdown
## Job Summary
- Job Title:
- Company:
- Company Type:
- Location:
- Distance KM:
- Work Mode:
- Source:
- Freshness:
- Salary:
- Seniority:

## Match Scores
- ATS Match:
- Technical Match:
- Domain Match:
- Seniority Match:
- Location Match:
- Freshness Score:
- Overall Score:

## Decision
Strong Apply / Apply / Stretch Apply / Skip

## Why
Short reason.

## Keywords to Add
Truthful ATS keywords.

## Resume Strategy
What to emphasize from the master resume.

## Missing / Weak Areas
Gaps or risks.

## Next Action
One clear next step.
```

## Resume Tailoring Rules

- Use the master resume as the source of truth.
- Use clean ATS format.
- No tables, graphics, columns, icons, or complex formatting in generated resumes.
- Use standard headings.
- Use bullet points.
- Reorder sections based on JD relevance.
- Emphasize matching tools, projects, business domains, and achievements.
- Add truthful JD keywords only when supported by the master resume.
- Reduce irrelevant content.
- Quantify impact only when supported.

## AI Provider Requirements

- Support OpenAI and Grok behind an internal provider abstraction.
- Route all AI calls through `lib/ai-tailoring.ts` or a service built on the same abstraction.
- Do not call provider SDKs directly inside route handlers.
- Require strict JSON responses for scoring/tailoring.
- Validate AI output before saving.
- Log provider metadata, model, prompt hash, fallback status, warnings, and output size.
- Do not store raw resume or JD text in AI interaction logs.

## Job Ingestion Requirements

MVP job ingestion should support:

- Local deterministic sample catalog.
- User-pasted JD.
- User-provided job URL extraction where technically allowed.
- Manual entry for job details.

Production connectors may support:

- JobStreet
- Indeed
- LinkedIn
- Company career pages
- Recruiter inbox/email parsing

Connector rule: do not bypass paywalls, login walls, robots restrictions, or site terms. Prefer official APIs, user-provided content, or browser-assisted extraction with user control.

## Core App Modules

- `auth`: sign in/out, session, user scope, admin access.
- `resumes`: master resume upload, parsing, profile extraction, resume versions.
- `jobs`: search, extraction, JD analysis, scoring.
- `applications`: tracker, status workflow, manual apply confirmation.
- `ai`: provider abstraction, prompts, validation, interaction metadata.
- `billing`: Stripe checkout, portal, subscription state, entitlements.
- `security`: rate limits, payload limits, headers, audit/security logging.
- `admin`: metrics, readiness notes, operational status.

## Production Readiness Requirements

- Auth.js with configured OAuth providers.
- Prisma/PostgreSQL production stores.
- Redis/Upstash rate limiting.
- S3 or UploadThing file storage.
- OCR for scanned PDFs.
- Branded sign-in and error pages.
- Stripe entitlement enforcement.
- Confirmation-gated HR email sending.
- Deployment docs and CI checks.
- External security review before selling widely.

