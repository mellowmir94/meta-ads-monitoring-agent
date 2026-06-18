"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type ChartPanelProps = {
  title: string;
  subtitle: string;
  type: "bar" | "line";
  data: Array<Record<string, string | number>>;
};

export function ChartPanel({ title, subtitle, type, data }: ChartPanelProps) {
  return (
    <section className="min-h-[320px] rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-ink/60">{subtitle}</p>
        </div>
        <select className="rounded-md border border-line bg-field px-2 py-1 text-sm" aria-label={`${title} period`}>
          <option>Month</option>
          <option>Quarter</option>
          <option>Year</option>
        </select>
      </div>
      <div className="mt-5 h-56">
        <ResponsiveContainer width="100%" height="100%">
          {type === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid stroke="#eee8da" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip formatter={(value) => `MYR ${Number(value).toLocaleString("en-MY")}`} />
              <Bar dataKey="value" fill="#1f6f5b" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid stroke="#eee8da" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip formatter={(value) => `MYR ${Number(value).toLocaleString("en-MY")}`} />
              <Line type="monotone" dataKey="value" stroke="#1f6f5b" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

