import { AppShell } from "@/components/app-shell";
import { runMetaAdsSetupCheck } from "@/lib/meta-ads/setup-check";
import { Activity, AlertTriangle, Database, MessageCircle, ShieldCheck } from "lucide-react";

export default function AdminPage() {
  const setup = runMetaAdsSetupCheck();
  const missing = setup.items.filter((item) => !item.ok);

  return (
    <AppShell activePath="/dashboard">
      <section className="grid gap-5">
        <div className="rounded-lg border border-line bg-ink p-5 text-white shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-skyglass">Meta Ads operations</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight">
            Runtime health, setup readiness, and read-only safety controls.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
            This page is for checking whether the monitoring agent is ready to sync Meta Ads data and send Telegram reports.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<Database className="h-5 w-5" />} label="Setup checks" value={`${setup.items.length - missing.length}/${setup.items.length}`} />
          <Metric icon={<ShieldCheck className="h-5 w-5" />} label="Mode" value="Read-only" />
          <Metric icon={<MessageCircle className="h-5 w-5" />} label="Telegram status" value={setup.items.find((item) => item.name === "TELEGRAM_BOT_TOKEN")?.ok ? "Ready" : "Missing"} />
          <Metric icon={<Activity className="h-5 w-5" />} label="Run endpoint" value="/api/meta-ads/run" />
        </div>

        <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-danger" />
            <h2 className="text-base font-semibold">Required setup</h2>
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
                Setup checks pass. Run `npm run meta-ads:daily`.
              </div>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="w-fit rounded-md bg-skyglass p-2 text-palm">{icon}</div>
      <span className="mt-4 block text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">{label}</span>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
