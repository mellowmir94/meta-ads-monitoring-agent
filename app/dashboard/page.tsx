import { AppShell } from "@/components/app-shell";
import { ApplySharpWorkbench } from "@/components/applysharp-workbench";
import { getSampleWorkspace } from "@/lib/applysharp";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  FileText,
  LockKeyhole,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud
} from "lucide-react";

const filters = ["MNC", "SME", "Fresh Graduate", "Remote", "Internship", "Contract", "Others"];
const tracker = [
  { label: "saved", count: 18 },
  { label: "tailored", count: 7 },
  { label: "downloaded", count: 5 },
  { label: "applied", count: 4 },
  { label: "interview", count: 1 },
  { label: "rejected", count: 2 },
  { label: "offer", count: 0 },
  { label: "archived", count: 9 }
];

export default function DashboardPage() {
  const workspace = getSampleWorkspace();
  const topJob = workspace.jobs[0];

  return (
    <AppShell activePath="/dashboard">
      <section className="flex flex-col gap-5">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-palm">ApplySharp Command Center</p>
                <h1 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight text-ink md:text-4xl">
                  Search fewer jobs. Tailor every strong application from verified resume truth.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/68">
                  Upload one master resume, parse the profile, score jobs against real evidence, generate ATS-safe resumes,
                  produce cover letters, and apply through official links with confirmation.
                </p>
              </div>
              <div className="grid min-w-72 grid-cols-2 gap-2 text-sm">
                <Metric label="Fit score" value={`${topJob.fit.fitScore}%`} />
                <Metric label="ATS score" value={`${topJob.fit.atsScore}%`} />
                <Metric label="Resume versions" value="7" />
                <Metric label="Apply actions" value="5" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-ink p-5 text-white shadow-panel">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-skyglass" />
              <span className="text-sm font-semibold">Truth-first AI guardrails</span>
            </div>
            <ul className="mt-4 grid gap-3 text-sm leading-6 text-white/78">
              <li>Never invent skills, companies, certifications, achievements, salary, or seniority.</li>
              <li>Prompt injection is stripped before JD analysis.</li>
              <li>Unverified keywords are warnings, not resume claims.</li>
              <li>No application is auto-submitted without user confirmation.</li>
            </ul>
          </div>
        </div>

        <ApplySharpWorkbench />

        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="flex flex-col gap-4">
            <WorkflowCard
              icon={<UploadCloud className="h-5 w-5" />}
              title="1. Upload master resume"
              text="PDF/DOCX upload is stored securely, parsed into structured profile data, and used as the only source of truth."
              action="Upload resume"
            />
            <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Parsed profile</h2>
                  <p className="text-sm text-ink/60">Skills, tools, industries, achievements, strengths, and gaps.</p>
                </div>
                <FileText className="h-5 w-5 text-palm" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {workspace.profile.keywords.map((keyword) => (
                  <span key={keyword} className="rounded-md border border-line bg-field px-2.5 py-1 text-xs font-semibold text-ink/70">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
            <WorkflowCard
              icon={<Search className="h-5 w-5" />}
              title="2. Search suitable jobs"
              text="Role, location, salary, company type, source, experience level, remote/on-site, industry, and platform filters."
              action="Search jobs"
            />
          </div>

          <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold">Job search filters</h2>
                <p className="text-sm text-ink/60">User enters a target role such as Analyst, then chooses categories.</p>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-line bg-field px-3 py-2 text-sm font-semibold">
                <Search className="h-4 w-4 text-palm" />
                Analyst
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {filters.map((filter) => (
                <span key={filter} className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink/72">
                  {filter}
                </span>
              ))}
            </div>

            <div className="mt-5 grid gap-3">
              {workspace.jobs.map(({ job, fit }) => (
                <article key={job.id} className="rounded-lg border border-line bg-field p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">{job.title}</h3>
                        <span className="rounded-sm bg-white px-2 py-1 text-xs font-semibold text-palm">{job.companyType}</span>
                        <span className="rounded-sm bg-white px-2 py-1 text-xs font-semibold text-ink/60">{job.sourcePlatform}</span>
                      </div>
                      <p className="mt-1 text-sm text-ink/60">
                        {job.company} / {job.location} / {job.workMode} / {job.salary}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-ink/70">
                        Missing: {fit.missingKeywords.slice(0, 5).join(", ") || "none"}. Matched:{" "}
                        {fit.matchedKeywords.slice(0, 5).join(", ")}.
                      </p>
                    </div>
                    <div className="grid min-w-44 grid-cols-2 gap-2 text-sm">
                      <Metric label="Fit" value={`${fit.fitScore}%`} />
                      <Metric label="ATS" value={`${fit.atsScore}%`} />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionChip icon={<Sparkles className="h-4 w-4" />} label="Analyze JD" />
                    <ActionChip icon={<FileText className="h-4 w-4" />} label="Tailor resume" />
                    <ActionChip icon={<Download className="h-4 w-4" />} label="Download PDF" />
                    <ActionChip icon={<Mail className="h-4 w-4" />} label={job.hrEmail ? "Email HR" : "Open apply link"} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Tailored resume engine</h2>
                <p className="text-sm text-ink/60">Editable preview before finalizing. PDF export stays ATS-friendly.</p>
              </div>
              <Sparkles className="h-5 w-5 text-palm" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                "Rewrite only supported master resume evidence.",
                "Map every added keyword back to source proof.",
                "Flag unsupported claims before the user edits."
              ].map((item) => (
                <div key={item} className="rounded-lg border border-line bg-field p-3 text-sm leading-6 text-ink/70">
                  <CheckCircle2 className="mb-3 h-4 w-4 text-palm" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Application tracker</h2>
                <p className="text-sm text-ink/60">Every job, resume version, cover letter, score, PDF, link, and status is saved.</p>
              </div>
              <BriefcaseBusiness className="h-5 w-5 text-palm" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              {tracker.map((item) => (
                <div key={item.label} className="rounded-md border border-line bg-field p-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">{item.label}</span>
                  <p className="mt-2 text-2xl font-semibold">{item.count}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <BottomCard
            icon={<LockKeyhole className="h-5 w-5 text-palm" />}
            title="Security and data handling"
            text="Secure uploads, API validation, encryption fields, audit logs, rate-limit hooks, and GDPR-friendly deletion flows are modeled in the backend schema."
          />
          <BottomCard
            icon={<ArrowUpRight className="h-5 w-5 text-palm" />}
            title="Direct apply workflow"
            text="Email HR when available, or open official company, JobStreet, Indeed, LinkedIn, and external apply links. User confirmation is required."
          />
          <BottomCard
            icon={<ShieldCheck className="h-5 w-5 text-palm" />}
            title="Subscription and admin"
            text="Admin dashboard and Stripe subscription entities are included in the production data model for commercialization."
          />
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-field p-3">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">{label}</span>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function WorkflowCard({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="rounded-md bg-skyglass p-2 text-palm">{icon}</div>
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink/65">{text}</p>
          </div>
        </div>
        <button className="rounded-md border border-line bg-field px-3 py-2 text-sm font-semibold text-ink/70">
          {action}
        </button>
      </div>
    </div>
  );
}

function ActionChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink/70">
      {icon}
      {label}
    </button>
  );
}

function BottomCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
      {icon}
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-ink/65">{text}</p>
    </div>
  );
}
