import { AppShell } from "@/components/app-shell";
import { BarChart3, Database, RefreshCw } from "lucide-react";

const plannedTables = [
  "MetaAdsAccount",
  "MetaAdsEntity",
  "MetaAdsPerformanceSnapshot",
  "MetaAdsAgentRun",
  "MetaAdsAlert",
  "MetaAdsReport"
];

export default function DatasetsPage() {
  return (
    <AppShell activePath="/dashboard">
      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-palm">Meta Ads data</p>
              <h1 className="mt-2 text-2xl font-semibold">Performance snapshots</h1>
            </div>
            <RefreshCw className="h-6 w-6 text-palm" />
          </div>
          <p className="mt-4 text-sm leading-6 text-ink/65">
            The agent stores normalized campaign, ad set, and ad metrics from Meta Marketing API syncs for baseline comparisons and reports.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-palm" />
            <h2 className="text-base font-semibold">Prisma models</h2>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {plannedTables.map((table) => (
              <div key={table} className="rounded-md border border-line bg-field px-3 py-2 text-sm font-medium">
                {table}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-5 shadow-panel lg:col-span-2">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-palm" />
            <h2 className="text-base font-semibold">Snapshot purpose</h2>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {["Daily performance history", "7-day baseline comparisons", "Telegram reports and alerts"].map((item) => (
              <div key={item} className="rounded-md border border-line bg-field p-3 text-sm leading-6 text-ink/70">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
