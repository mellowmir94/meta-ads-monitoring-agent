import { AppShell } from "@/components/app-shell";
import { listAiInteractions } from "@/lib/ai-interaction-repository";
import { summarizeAiInteractions } from "@/lib/ai-interaction-store";
import { authorizeAdminRequest } from "@/lib/admin-authorization";
import { applicationStatuses } from "@/lib/applysharp";
import { listApplications } from "@/lib/application-repository";
import { summarizeApplicationRecords } from "@/lib/application-store";
import { resolveSubscriptionEntitlements } from "@/lib/entitlements";
import { listMasterResumes } from "@/lib/master-resume-repository";
import { summarizeMasterResumes } from "@/lib/master-resume-store";
import { getRateLimitStorageMode, resolveRedisRateLimitConfig } from "@/lib/rate-limit";
import { buildResumeVersionHistory, summarizeResumeVersionHistory } from "@/lib/resume-version-history";
import { listSubscriptions } from "@/lib/subscription-repository";
import { summarizeSubscriptions } from "@/lib/subscription-store";
import { BarChart3, BriefcaseBusiness, Download, ShieldCheck, UserCheck } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authorization = await authorizeAdminRequest(await headers());

  if (!authorization.authorized) {
    return (
      <AppShell activePath="/admin">
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">Admin access</p>
          <h1 className="mt-2 text-2xl font-semibold">Role-gated admin access required</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">{authorization.reason}</p>
          <Link href="/account" className="mt-5 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
            Open account
          </Link>
        </section>
      </AppShell>
    );
  }

  const applicationResult = await listApplications(authorization.userScope);
  const aiInteractionResult = await listAiInteractions(authorization.userScope);
  const masterResumeResult = await listMasterResumes(authorization.userScope);
  const subscriptionResult = await listSubscriptions(authorization.userScope);
  const applications = applicationResult.data;
  const summary = summarizeApplicationRecords(applications);
  const masterResumeSummary = summarizeMasterResumes(masterResumeResult.data);
  const subscriptionSummary = summarizeSubscriptions(subscriptionResult.data);
  const entitlements = resolveSubscriptionEntitlements(subscriptionResult.data);
  const resumeVersions = buildResumeVersionHistory(applications);
  const resumeVersionSummary = summarizeResumeVersionHistory(resumeVersions);
  const aiSummary = summarizeAiInteractions(aiInteractionResult.data);
  const rateLimitMode = getRateLimitStorageMode(resolveRedisRateLimitConfig());
  const sources = Object.entries(summary.bySource).sort(([, left], [, right]) => (right ?? 0) - (left ?? 0));
  const aiProviders = Object.entries(aiSummary.byProvider).sort(([, left], [, right]) => right - left);

  return (
    <AppShell activePath="/admin">
      <section className="grid gap-5">
        <div className="rounded-lg border border-line bg-ink p-5 text-white shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-skyglass">Admin overview</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight">
            Application operations, conversion signals, and first-user data health.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
            Admin role: {authorization.role}. User scope: {authorization.userScope.source}. Application storage: {applicationResult.storage}. Master resume storage: {masterResumeResult.storage}. Subscription storage: {subscriptionResult.storage}. AI log storage: {aiInteractionResult.storage}. Prisma persistence is opt-in; local JSON remains the first-user fallback.
          </p>
          {applicationResult.warning ? <p className="mt-2 max-w-2xl text-xs leading-5 text-white/55">Storage fallback warning: {applicationResult.warning}</p> : null}
          {masterResumeResult.warning ? <p className="mt-2 max-w-2xl text-xs leading-5 text-white/55">Master resume fallback warning: {masterResumeResult.warning}</p> : null}
          {subscriptionResult.warning ? <p className="mt-2 max-w-2xl text-xs leading-5 text-white/55">Subscription fallback warning: {subscriptionResult.warning}</p> : null}
          {aiInteractionResult.warning ? <p className="mt-2 max-w-2xl text-xs leading-5 text-white/55">AI log fallback warning: {aiInteractionResult.warning}</p> : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<BriefcaseBusiness className="h-5 w-5" />} label="Saved applications" value={summary.total} />
          <Metric icon={<BarChart3 className="h-5 w-5" />} label="Average fit score" value={`${summary.averageScore}%`} />
          <Metric icon={<Download className="h-5 w-5" />} label="Resume versions" value={resumeVersionSummary.total} />
          <Metric icon={<UserCheck className="h-5 w-5" />} label="Active subscriptions" value={subscriptionSummary.active + subscriptionSummary.trialing} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Pipeline by status</h2>
                <p className="text-sm text-ink/60">Tracks saved, tailored, downloaded, applied, interview, rejected, offer, and archived.</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-palm" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {applicationStatuses.map((status) => (
                <div key={status} className="rounded-md border border-line bg-field p-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">{status}</span>
                  <p className="mt-1 text-2xl font-semibold">{summary.byStatus[status]}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <h2 className="text-base font-semibold">Recent applications</h2>
            <p className="text-sm text-ink/60">Includes role, company, source, PDF filename, and latest tracker state.</p>
            <div className="mt-4 grid gap-2">
              {applications.length === 0 ? (
                <div className="rounded-md border border-dashed border-line bg-field p-4 text-sm text-ink/60">
                  No saved applications yet. Analyze a JD, generate assets, then save/download/apply from the workbench.
                </div>
              ) : (
                applications.slice(0, 8).map((application) => (
                  <article key={application.id} className="rounded-md border border-line bg-field p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{application.job.title}</h3>
                        <p className="mt-1 text-ink/60">{application.job.company} / {application.sourcePlatform} / {application.score}%</p>
                      </div>
                      <span className="rounded-sm bg-white px-2 py-1 text-xs font-semibold text-palm">{application.status}</span>
                    </div>
                    <p className="mt-2 text-ink/55">{application.resumeVersion.pdfFileName ?? "PDF not generated yet"}</p>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <AdminCard title="Source mix" text={sources.length ? sources.map(([source, count]) => `${source}: ${count}`).join(" / ") : "No source data yet."} />
          <AdminCard title="Active master resume" text={masterResumeSummary.activeId ? `${masterResumeSummary.activeTitle} / ${masterResumeSummary.activeKeywordCount} parsed keywords / updated ${masterResumeSummary.activeUpdatedAt}` : "No active master resume saved yet."} />
          <AdminCard title="Resume versions" text={resumeVersionSummary.total ? `${resumeVersionSummary.total} versions / ${resumeVersionSummary.withPdf} PDFs / ${resumeVersionSummary.withCoverLetter} cover letters / ${resumeVersionSummary.averageScore}% avg score` : "No tailored resume versions saved yet."} />
          <AdminCard title="Billing" text={`${subscriptionSummary.total} subscriptions / active ${subscriptionSummary.active} / trialing ${subscriptionSummary.trialing} / past due ${subscriptionSummary.pastDue} / canceled ${subscriptionSummary.canceled}`} />
          <AdminCard title="Entitlements" text={`${entitlements.plan} plan / ${entitlements.maxSavedJobs} saved jobs / ${entitlements.maxTailoredResumesPerMonth} tailored resumes per month / ${entitlements.maxAiAnalysesPerMonth} AI analyses per month`} />
          <AdminCard title="AI observability" text={aiProviders.length ? `${aiSummary.total} metadata-only calls / providers: ${aiProviders.map(([provider, count]) => `${provider}: ${count}`).join(" / ")}` : "No AI tailoring calls logged yet."} />
          <AdminCard title="Security posture" text={`Upload parsing, Zod API validation, prompt-injection filtering, metadata-only AI logs, user confirmation before apply actions, runtime data isolation, and ${rateLimitMode} API rate limiting are active.`} />
          <AdminCard title="Production next" text="Add branded OAuth pages, Stripe invoice access, Redis rate limiting, and production file storage." />
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="rounded-md bg-skyglass p-2 text-palm w-fit">{icon}</div>
      <span className="mt-4 block text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">{label}</span>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function AdminCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-ink/65">{text}</p>
    </div>
  );
}
