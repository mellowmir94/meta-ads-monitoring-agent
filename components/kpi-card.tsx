import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ExecutiveKpi } from "@/lib/seed-data";

type KpiCardProps = {
  kpi: ExecutiveKpi;
};

export function KpiCard({ kpi }: KpiCardProps) {
  const positive = kpi.trend >= 0;

  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink/60">{kpi.name}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{kpi.value}</p>
        </div>
        <span
          className={clsx(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold",
            positive ? "bg-skyglass text-palm" : "bg-red-50 text-danger"
          )}
        >
          {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(kpi.trend)}%
        </span>
      </div>
      <p className="mt-4 text-sm leading-5 text-ink/65">{kpi.evidence}</p>
    </article>
  );
}

