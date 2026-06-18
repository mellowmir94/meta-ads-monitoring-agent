import { AppShell } from "@/components/app-shell";
import { runMetaAdsSetupCheck } from "@/lib/meta-ads/setup-check";
import type React from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarClock,
  CheckCircle2,
  Database,
  MessageCircle,
  ShieldCheck,
  TrendingUp
} from "lucide-react";

const metrics = [
  "Spend",
  "Impressions",
  "Reach",
  "Clicks",
  "CTR",
  "CPC",
  "CPM",
  "Leads",
  "CPL",
  "Frequency"
];

const alertRules = [
  "Spend above RM100 with zero leads",
  "CPL 30% above 7-day average",
  "CTR below 0.8%",
  "Frequency above 4",
  "Active delivery with zero impressions",
  "Spend up while leads drop",
  "CPM spike above 30%",
  "Creative or audience fatigue"
];

export default function DashboardPage() {
  const setup = runMetaAdsSetupCheck();
  const missing = setup.items.filter((item) => !item.ok);
  const readyCount = setup.items.length - missing.length;

  return (
    <AppShell activePath="/dashboard">
      <section className="flex flex-col gap-5">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-palm">Meta Ads Monitoring Agent</p>
              <h1 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight text-ink md:text-4xl">
                Read-only ad performance monitoring with Telegram status reports.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/68">
                Track campaigns, ad sets, and ads for local services. Detect wasted spend, rising CPL, weak CTR, fatigue,
                and scaling opportunities without changing anything inside Meta Ads.
              </p>
            </div>
            <div className="grid min-w-72 grid-cols-2 gap-2 text-sm">
              <Metric label="Setup checks" value={`${readyCount}/${setup.items.length}`} tone={setup.ok ? "good" : "warn"} />
              <Metric label="Mode" value="Read-only" tone="good" />
              <Metric label="Reports" value="Daily / weekly" tone="neutral" />
              <Metric label="Telegram" value={setup.items.find((item) => item.name === "TELEGRAM_BOT_TOKEN")?.ok ? "Ready" : "Missing"} tone="warn" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Setup status</h2>
                <p className="text-sm text-ink/60">Safe checks only. Secret values are never printed.</p>
              </div>
              <Database className="h-5 w-5 text-palm" />
            </div>
            <div className="mt-4 grid gap-2">
              {setup.items.map((item) => (
                <div key={item.name} className="flex items-start gap-3 rounded-md border border-line bg-field p-3">
                  {item.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-palm" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-danger" />}
                  <div>
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="text-sm text-ink/62">{item.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-ink p-4 text-white shadow-panel">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-skyglass" />
              <h2 className="text-base font-semibold">Safety contract</h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                "Never pause campaigns automatically.",
                "Never edit budgets automatically.",
                "Never create, delete, or modify ads.",
                "Only recommend actions with evidence.",
                "Future write actions require explicit approval.",
                "Do not expose tokens in logs or reports."
              ].map((item) => (
                <div key={item} className="rounded-md border border-white/10 bg-white/8 p-3 text-sm leading-6 text-white/78">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <WorkflowCard
            icon={<BarChart3 className="h-5 w-5" />}
            title="1. Pull Meta Ads data"
            text="Fetch campaign, ad set, and ad insights from the Meta Marketing API using read-only requests."
          />
          <WorkflowCard
            icon={<Activity className="h-5 w-5" />}
            title="2. Analyze performance"
            text="Compare yesterday with 7-day baselines for spend, CPL, CTR, CPM, leads, and delivery signals."
          />
          <WorkflowCard
            icon={<MessageCircle className="h-5 w-5" />}
            title="3. Report to Telegram"
            text="Send run status, critical issues, warnings, good news, and recommended actions to Telegram."
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Metrics monitored</h2>
                <p className="text-sm text-ink/60">Tracked at campaign, ad set, and ad level.</p>
              </div>
              <TrendingUp className="h-5 w-5 text-palm" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {metrics.map((metric) => (
                <span key={metric} className="rounded-md border border-line bg-field px-3 py-2 text-sm font-semibold text-ink/72">
                  {metric}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Alert rules</h2>
                <p className="text-sm text-ink/60">Rules create Telegram-ready evidence, impact, and recommendations.</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-danger" />
            </div>
            <div className="mt-4 grid gap-2">
              {alertRules.map((rule) => (
                <div key={rule} className="rounded-md border border-line bg-field px-3 py-2 text-sm text-ink/72">
                  {rule}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-5 w-5 text-palm" />
              <h2 className="text-base font-semibold">Run commands</h2>
            </div>
            <div className="mt-4 grid gap-2 font-mono text-sm">
              <Command text="npm run meta-ads:check-setup" />
              <Command text="npm run db:push" />
              <Command text="npm run meta-ads:daily" />
              <Command text="npm run meta-ads:weekly" />
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center gap-3">
              <Bot className="h-5 w-5 text-palm" />
              <h2 className="text-base font-semibold">Next required setup</h2>
            </div>
            <div className="mt-4 grid gap-2">
              {setup.nextActions.length ? (
                setup.nextActions.map((action, index) => (
                  <div key={action} className="rounded-md border border-line bg-field p-3 text-sm leading-6 text-ink/70">
                    {index + 1}. {action}
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-line bg-skyglass p-3 text-sm font-semibold text-palm">
                  Setup checks pass. Run the daily agent.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "neutral" }) {
  const toneClass = tone === "good" ? "text-palm" : tone === "warn" ? "text-danger" : "text-ink";

  return (
    <div className="rounded-md border border-line bg-field p-3">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">{label}</span>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function WorkflowCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="rounded-md bg-skyglass p-2 text-palm">{icon}</div>
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-ink/65">{text}</p>
    </div>
  );
}

function Command({ text }: { text: string }) {
  return <div className="rounded-md border border-line bg-field px-3 py-2 text-ink/78">{text}</div>;
}
