import React from "react";
import { createRoot } from "react-dom/client";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const fallbackColors = {
  accent: "#2563eb",
  accent2: "#0f9f78",
  amber: "#d97706",
  danger: "#dc2626",
  muted: "#64748b",
  text: "#0f172a",
  grid: "#dbe3ed",
};

const money = (value) => `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value) => Number(value || 0).toLocaleString("en-MY", { maximumFractionDigits: 2 });
const compactMoney = (value) => {
  const amount = Number(value || 0);
  const absolute = Math.abs(amount);
  if (absolute >= 1_000_000) return `RM ${(amount / 1_000_000).toLocaleString("en-MY", { maximumFractionDigits: 1 })}m`;
  if (absolute >= 1_000) return `RM ${(amount / 1_000).toLocaleString("en-MY", { maximumFractionDigits: 0 })}k`;
  return `RM ${amount.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;
};

function formatTooltipValue(value, kind) {
  if (kind === "reimbursement-ranking") return `${number(value)}%`;
  if (kind === "trend" && /rate|percent/i.test(String(value))) return `${number(value)}%`;
  return money(value);
}

function FinanceTooltip({ active, payload, label, kind }) {
  if (!active || !payload?.length) return null;
  if (kind === "commission-state-pie") {
    const entry = payload[0];
    const state = String(entry?.payload?.state || entry?.name || label || "State").toUpperCase();
    return React.createElement(
      "div",
      { className: "recharts-tooltip commission-state-tooltip" },
      React.createElement("strong", null, state),
      React.createElement("span", { className: "commission-state-tooltip-value" }, formatTooltipValue(entry?.value, kind)),
    );
  }
  if (kind === "tier-pie") {
    const entry = payload[0];
    const item = entry?.payload || {};
    return React.createElement(
      "div",
      { className: "recharts-tooltip" },
      React.createElement("strong", null, String(item.tier || entry?.name || "Tier")),
      React.createElement("div", null, React.createElement("span", null, "Net Sales"), React.createElement("b", null, money(entry?.value))),
      React.createElement("div", null, React.createElement("span", null, "Orders"), React.createElement("b", null, number(item.orders))),
      React.createElement("div", null, React.createElement("span", null, "Share"), React.createElement("b", null, `${number(item.share)}%`)),
    );
  }
  if (kind === "commission-status-ranked") {
    const entry = payload[0];
    const item = entry?.payload || {};
    return React.createElement("div", { className: "recharts-tooltip" },
      React.createElement("strong", null, String(label || item.label || "Payment status")),
      React.createElement("div", null, React.createElement("span", null, "Commission"), React.createElement("b", null, money(item.value ?? entry?.value))),
    );
  }
  return React.createElement(
    "div",
    { className: "recharts-tooltip" },
    React.createElement("strong", null, String(label || payload[0]?.payload?.label || "Finance detail")),
    ...payload.map((entry, index) => React.createElement(
      "div",
      { key: `${entry.dataKey || entry.name || "value"}-${index}` },
      React.createElement("span", null, String(entry.name || entry.dataKey || "Value")),
      React.createElement("b", null, formatTooltipValue(entry.value, kind)),
    )),
  );
}

function ChartFrame({ children, minWidth = 0 }) {
  return React.createElement(ResponsiveContainer, { width: "100%", height: "100%", minWidth, debounce: 80 }, children);
}

function paletteFor(index, colors) {
  return [colors.accent, colors.accent2, colors.amber, "#7c3aed", "#0891b2", "#db2777"][index % 6];
}

function emitSelection(panelId, value) {
  if (!value || value === "Other states") return;
  window.dispatchEvent(new CustomEvent("finance-recharts-select", { detail: { panelId, value: String(value) } }));
}

function statePieLabel({ cx, cy, midAngle, outerRadius, name, percent, payload, includeShare = true }) {
  const radians = Math.PI / 180;
  // Keep labels outside the ring with enough breathing room for the
  // connector line. The two-line treatment makes the chart presentation-
  // ready without forcing finance users to hover every slice.
  const radius = Number(outerRadius || 0) + 22;
  const x = Number(cx || 0) + radius * Math.cos(-midAngle * radians);
  const y = Number(cy || 0) + radius * Math.sin(-midAngle * radians);
  const anchor = x >= Number(cx || 0) ? "start" : "end";
  const share = `${number(Number(percent || 0) * 100)}%`;
  const state = String(name || payload?.state || payload?.name || "State");
  const amount = money(payload?.commission ?? payload?.value ?? 0);
  return React.createElement("g", { className: "commission-state-label" },
    React.createElement("text", {
      x,
      y: y - (includeShare ? 5 : 0),
      textAnchor: anchor,
      dominantBaseline: "central",
      fill: "var(--text)",
      fontSize: 11,
      fontWeight: 750,
    }, state),
    includeShare && React.createElement("text", {
      x,
      y: y + 10,
      textAnchor: anchor,
      dominantBaseline: "central",
      fill: "var(--text-soft)",
      fontSize: 10,
      fontWeight: 600,
    }, `${amount} · ${share}`),
  );
}

function PieView({ panelId, payload, colors, labels }) {
  const values = Array.isArray(payload.values) ? payload.values : [];
  return React.createElement(ChartFrame, null,
    React.createElement(PieChart, { margin: { top: 4, right: 8, bottom: 4, left: 8 } },
      React.createElement(Pie, {
        data: values,
        dataKey: "commission",
        nameKey: "state",
        cx: "50%",
        cy: "50%",
        innerRadius: "49%",
        outerRadius: "95%",
        paddingAngle: 2,
        stroke: colors.grid,
        strokeWidth: 1,
        // Keep the ring centered and uncluttered; state names live in the
        // adjacent ledger so every value remains readable at a glance.
        isAnimationActive: false,
        onClick: (entry) => emitSelection(panelId, entry?.state ?? entry?.payload?.state ?? entry?.name ?? entry?.payload?.name),
        label: false,
        labelLine: false,
      }, values.map((entry, index) => React.createElement(Cell, { key: entry.state, fill: entry.color || (entry.state === "Unmapped" ? colors.danger : entry.state === "Other states" ? colors.muted : paletteFor(index, colors)) }))),
      React.createElement(Tooltip, { content: React.createElement(FinanceTooltip, { kind: "commission-state-pie" }) }),
    ),
  );
}

function TierPieView({ panelId, payload, colors, labels }) {
  const values = Array.isArray(payload.values) ? payload.values : [];
  const tierColor = (entry) => entry?.color || ({ Low: colors.accent, Medium: colors.amber, High: colors.accent2, Unmapped: colors.muted }[String(entry?.tier)] || colors.muted);
  return React.createElement(ChartFrame, null,
    React.createElement(PieChart, null,
      React.createElement(Pie, {
        data: values,
        dataKey: "value",
        nameKey: "tier",
        cx: "50%",
        cy: "50%",
        innerRadius: "49%",
        outerRadius: "77%",
        paddingAngle: 2,
        stroke: colors.grid,
        strokeWidth: 1,
        isAnimationActive: false,
        onClick: (entry) => emitSelection(panelId, entry?.filterValue ?? entry?.payload?.filterValue ?? entry?.tier ?? entry?.payload?.tier ?? entry?.name),
        label: false,
        labelLine: false,
      }, values.map((entry) => React.createElement(Cell, { key: entry.tier, fill: tierColor(entry) }))),
      React.createElement(Tooltip, { content: React.createElement(FinanceTooltip, { kind: "tier-pie" }) }),
    ),
  );
}

function PitstopTotalView({ panelId, payload, colors, labels }) {
  const values = horizontalRows(payload);
  return React.createElement(ChartFrame, null,
    React.createElement(BarChart, { data: values, layout: "vertical", margin: { top: 12, right: 76, bottom: 28, left: 12 }, onClick: (event) => emitSelection(panelId, event?.activeLabel) },
      React.createElement(CartesianGrid, { stroke: colors.grid, strokeDasharray: "3 3", horizontal: false }),
      React.createElement(XAxis, { type: "number", tick: { fill: colors.muted, fontSize: 12 }, tickMargin: 8, tickFormatter: (v) => number(v) }),
      React.createElement(YAxis, { type: "category", dataKey: "label", width: 196, tick: { fill: colors.text, fontSize: 12 }, tickMargin: 8, interval: 0 }),
      React.createElement(Tooltip, { cursor: { fill: `${colors.accent}12` }, content: React.createElement(FinanceTooltip, { kind: "pitstop-total" }) }),
      React.createElement(Bar, { dataKey: "value", name: "Net Sales (RM)", radius: [0, 5, 5, 0], barSize: 20, isAnimationActive: false, label: labels ? { position: "right", fill: colors.text, fontSize: 12, formatter: (v) => number(v) } : false }, values.map((item, index) => React.createElement(Cell, { key: item.label, fill: item.color || (item.state === "Unmapped" ? colors.muted : paletteFor(index, colors)) }))),
    ),
  );
}

function horizontalRows(payload) {
  return (Array.isArray(payload.values) ? payload.values : []).map((item) => ({
    ...item,
    label: String(item.label ?? item.state ?? ""),
    value: Number(item.value ?? item.ratio ?? 0),
  }));
}

function commissionStatusDomain(values) {
  const amounts = values.map((item) => item.value).filter(Number.isFinite);
  const low = Math.min(0, ...amounts);
  const high = Math.max(0, ...amounts);
  // A single zero-based linear scale preserves comparisons, including negative amounts.
  return low === high ? [0, 1] : [low, high];
}

function CommissionStatusBar({ x, y, width, height, fill, payload, panelId, colors }) {
  if (![x, y, width, height].every(Number.isFinite)) return null;
  const value = Number(payload?.value || 0);
  const end = x + width;
  const centerY = y + height / 2;
  const zero = value === 0;
  const small = !zero && Math.abs(width) < 3;
  const labelX = Math.max(x, end) + 10;
  const smallDescription = small ? " Small amount marked with a diamond; bar length remains proportional." : "";
  const select = (event) => {
    event.stopPropagation();
    emitSelection(panelId, payload?.label);
  };
  return React.createElement("g", {
    className: "commission-status-bar",
    role: "button",
    tabIndex: 0,
    "aria-label": `${payload?.label}: ${money(value)}.${smallDescription} Filter matching records.`,
    onClick: select,
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(event); }
    },
  },
  React.createElement("title", null, `${payload?.label}: ${money(value)}.${smallDescription}`),
  React.createElement("rect", { className: "commission-status-hit-target", x: Math.min(x, end) - 6, y: centerY - Math.max(36, height) / 2, width: Math.abs(width) + 132, height: Math.max(36, height), rx: 4, fill: "transparent" }),
  !zero && React.createElement("rect", { className: "commission-status-value-bar", x: Math.min(x, end), y, width: Math.abs(width), height, rx: Math.min(5, Math.abs(width) / 2), fill }),
  small && React.createElement("path", { className: "commission-status-small-marker", d: `M ${end} ${centerY - 4} l 4 4 l -4 4 l -4 -4 Z`, fill }),
  zero && React.createElement("circle", { className: "commission-status-zero-marker", cx: x, cy: centerY, r: 4, fill: "none", stroke: fill, strokeWidth: 2 }),
  React.createElement("text", { className: "commission-status-amount", x: labelX, y: centerY, dominantBaseline: "central", fill: colors.text, fontSize: 12, fontWeight: 650, pointerEvents: "none" }, money(value)),
  );
}

function RankedView({ panelId, kind, payload, colors, labels }) {
  const values = horizontalRows(payload);
  const ratio = kind === "reimbursement-ranking";
  const statusPalette = Array.isArray(payload.colors) ? payload.colors : [];
  const isCommissionStatus = kind === "commission-status-ranked";
  const max = ratio ? Number(payload.max || 100) : undefined;
  const domain = isCommissionStatus
    ? commissionStatusDomain(values)
    : ratio ? [0, max] : [0, "auto"];
  return React.createElement(ChartFrame, { minWidth: isCommissionStatus ? 600 : 0 },
    React.createElement(BarChart, { data: values, layout: "vertical", margin: { top: 8, right: isCommissionStatus ? 132 : 24, bottom: 8, left: 8 }, onClick: (event) => emitSelection(panelId, event?.activeLabel) },
      React.createElement(CartesianGrid, { stroke: colors.grid, strokeDasharray: "3 3", horizontal: false }),
      React.createElement(XAxis, { type: "number", domain, scale: isCommissionStatus ? "linear" : "auto", tick: { fill: colors.muted, fontSize: 11 }, tickFormatter: (v) => ratio ? `${v}%` : number(v) }),
      React.createElement(YAxis, { type: "category", dataKey: "label", width: 142, tick: { fill: colors.text, fontSize: 11 }, interval: 0 }),
      React.createElement(Tooltip, { cursor: { fill: `${colors.accent}12` }, content: React.createElement(FinanceTooltip, { kind }) }),
      ratio && React.createElement(ReferenceLine, { x: Number(payload.policyLimit || 25), stroke: colors.danger, strokeDasharray: "5 4", label: { value: "Policy limit", fill: colors.danger, fontSize: 10 } }),
      React.createElement(Bar, { dataKey: "value", name: ratio ? "Rate" : payload.measureLabel || "Value", fill: colors.accent, radius: [0, 5, 5, 0], barSize: isCommissionStatus ? 36 : 18, isAnimationActive: false,
        shape: isCommissionStatus ? (props) => React.createElement(CommissionStatusBar, { ...props, panelId, colors }) : undefined,
        label: labels && !isCommissionStatus ? { position: "right", fill: colors.text, fontSize: 11, formatter: (v) => ratio ? `${number(v)}%` : number(v) } : false },
        isCommissionStatus && values.map((item, index) => React.createElement(Cell, { key: item.label, fill: statusPalette[index] || colors.accent })),
      ),
    ),
  );
}

function groupedRows(values) {
  const map = new Map();
  for (const item of values || []) {
    const label = String(item.label ?? item.date ?? "");
    const row = map.get(label) || { label };
    const key = String(item.metric ?? item.status ?? item.series ?? "Value").replace(/[^a-zA-Z0-9_]/g, "_");
    row[key] = Number(item.value ?? item.amount ?? 0);
    map.set(label, row);
  }
  return [...map.values()];
}

function GroupedView({ kind, payload, colors, labels }) {
  const source = Array.isArray(payload.values) ? payload.values : [];
  const rows = groupedRows(source);
  const keys = [...new Set(source.map((item) => String(item.metric ?? item.status ?? item.series ?? "Value").replace(/[^a-zA-Z0-9_]/g, "_")))];
  const horizontal = kind === "branch-bridge" || kind === "channel-comparison";
  return React.createElement(ChartFrame, null,
    React.createElement(BarChart, { data: rows, margin: { top: 12, right: 20, bottom: 24, left: 8 }, barCategoryGap: "22%" },
      React.createElement(CartesianGrid, { stroke: colors.grid, strokeDasharray: "3 3", vertical: false }),
      React.createElement(XAxis, { dataKey: "label", tick: { fill: colors.muted, fontSize: 10 }, interval: 0, angle: horizontal ? -20 : 0, textAnchor: horizontal ? "end" : "middle", height: horizontal ? 54 : 28 }),
      React.createElement(YAxis, { tick: { fill: colors.muted, fontSize: 10 }, tickFormatter: (v) => number(v), width: 56 }),
      React.createElement(Tooltip, { content: React.createElement(FinanceTooltip, { kind: "grouped" }) }),
      ...keys.map((key, index) => React.createElement(Bar, { key, dataKey: key, name: key.replace(/_/g, " "), fill: paletteFor(index, colors), radius: [4, 4, 0, 0], isAnimationActive: false, label: labels ? { position: "top", fill: colors.text, fontSize: 9, formatter: (v) => number(v) } : false })),
      keys.length > 1 && React.createElement(Legend, { wrapperStyle: { color: colors.text, fontSize: 11 } }),
    ),
  );
}

function TrendView({ payload, colors, labels }) {
  const values = Array.isArray(payload.values) ? payload.values : [];
  const rows = groupedRows(values);
  const keys = [...new Set(values.map((item) => String(item.series ?? "Value").replace(/[^a-zA-Z0-9_]/g, "_")))];
  const moneyAxis = payload.valueFormat === "money";
  const seriesColor = (key, index) => payload.seriesColors?.[key] || payload.seriesColors?.[key.replace(/_/g, " ")] || paletteFor(index, colors);
  return React.createElement(ChartFrame, null,
    React.createElement(LineChart, { data: rows, margin: { top: 12, right: 24, bottom: 18, left: 8 } },
      React.createElement(CartesianGrid, { stroke: colors.grid, strokeDasharray: "3 3", vertical: false }),
      React.createElement(XAxis, { dataKey: "label", tick: { fill: colors.muted, fontSize: 10 }, interval: "preserveStartEnd", minTickGap: 28, tickMargin: 8, height: 34 }),
      React.createElement(YAxis, { tick: { fill: colors.muted, fontSize: 10 }, tickFormatter: (v) => moneyAxis ? compactMoney(v) : number(v), width: moneyAxis ? 78 : 58, label: payload.axisTitle ? { value: payload.axisTitle, angle: -90, position: "insideLeft", fill: colors.muted, fontSize: 10, offset: 3 } : undefined }),
      React.createElement(Tooltip, { content: React.createElement(FinanceTooltip, { kind: "trend" }) }),
      ...keys.map((key, index) => React.createElement(Line, { key, type: "monotone", dataKey: key, name: key.replace(/_/g, " "), stroke: seriesColor(key, index), strokeWidth: 2.5, dot: false, activeDot: { r: 4, strokeWidth: 2 }, connectNulls: true, isAnimationActive: false })),
      keys.length > 1 && !payload.externalLegend && React.createElement(Legend, { wrapperStyle: { color: colors.text, fontSize: 11 } }),
    ),
  );
}

function pitstopTrendDateLabel(value, group = "day", compact = false) {
  const [year, month, day = 1] = String(value).split("-").map(Number);
  if (!year || !month) return String(value);
  const date = new Date(year, month - 1, day);
  const options = group === "month"
    ? { month: "short", year: compact ? "2-digit" : "numeric" }
    : { day: "numeric", month: "short", ...(compact ? {} : { year: "numeric" }) };
  const text = date.toLocaleDateString("en-GB", options);
  return group === "week" && !compact ? `Week of ${text}` : text;
}

function PitstopTrendTooltip({ active, payload, label, group }) {
  if (!active || !payload?.length) return null;
  // A state has both an area and a line, but appears only once in the tooltip.
  const entries = [...new Map(payload.filter((entry) => entry.type !== "none" && entry.value != null)
    .map((entry) => [entry.dataKey, entry])).values()];
  if (!entries.length) return null;
  return React.createElement("div", { className: "recharts-tooltip pitstop-trend-tooltip" },
    React.createElement("strong", null, pitstopTrendDateLabel(label, group)),
    ...entries.map((entry) => React.createElement("div", { key: entry.dataKey },
      React.createElement("span", { className: "pitstop-tooltip-state" },
        React.createElement("i", { style: { background: entry.color }, "aria-hidden": true }), entry.name),
      React.createElement("b", null, money(entry.value)),
    )),
  );
}

function PitstopStateTrendView({ payload, colors }) {
  const values = Array.isArray(payload.values) ? payload.values : [];
  const rows = groupedRows(values);
  const series = [...new Set(values.map((item) => String(item.series)))];
  const stateColor = (name, index) => payload.seriesColors?.[name] || paletteFor(index, colors);
  const highlighted = new Set(payload.highlightStates || []);
  return React.createElement(ChartFrame, null,
    React.createElement(ComposedChart, {
      data: rows, margin: { top: 16, right: 18, bottom: 8, left: 0 }, accessibilityLayer: true,
    },
      React.createElement(CartesianGrid, { stroke: colors.grid, strokeDasharray: "3 5", vertical: false }),
      React.createElement(XAxis, { dataKey: "label", tick: { fill: colors.muted, fontSize: 11 },
        tickFormatter: (date) => pitstopTrendDateLabel(date, payload.group, true),
        interval: "preserveStartEnd", minTickGap: 30, tickMargin: 12, height: 36,
        axisLine: { stroke: colors.grid }, tickLine: false, padding: { left: 9, right: 9 } }),
      React.createElement(YAxis, { tick: { fill: colors.muted, fontSize: 11 }, tickFormatter: compactMoney,
        width: 70, tickMargin: 8, tickCount: 5, axisLine: false, tickLine: false,
        domain: [(min) => Math.min(0, min), "auto"] }),
      React.createElement(ReferenceLine, { y: 0, stroke: colors.grid }),
      React.createElement(Tooltip, { content: React.createElement(PitstopTrendTooltip, { group: payload.group }),
        cursor: { stroke: colors.muted, strokeWidth: 1, strokeDasharray: "4 4" },
        isAnimationActive: false, offset: 14, allowEscapeViewBox: { x: false, y: false } }),
      ...series.map((name, index) => React.createElement(Area, {
        key: `fill-${name}`, type: "linear", dataKey: name.replace(/[^a-zA-Z0-9_]/g, "_"), name,
        stroke: "none", fill: stateColor(name, index), fillOpacity: 0.055,
        baseValue: 0, tooltipType: "none", legendType: "none", dot: false, activeDot: false,
        connectNulls: true, isAnimationActive: false,
      })),
      ...series.map((name, index) => React.createElement(Line, {
        key: name, type: "linear", dataKey: name.replace(/[^a-zA-Z0-9_]/g, "_"), name,
        stroke: stateColor(name, index), strokeWidth: highlighted.has(name) ? 3.4 : 2.6,
        dot: { r: highlighted.has(name) ? 3.8 : 3, fill: stateColor(name, index), stroke: "var(--surface)", strokeWidth: 1.5 },
        activeDot: { r: 5.5, fill: stateColor(name, index), stroke: "var(--text)", strokeWidth: 2 },
        connectNulls: true, isAnimationActive: false,
      })),
    ),
  );
}

function LiabilityView({ payload, colors }) {
  const values = Array.isArray(payload.values) ? payload.values : [];
  const rows = groupedRows(values);
  const keys = [...new Set(values.map((item) => String(item.status ?? "Value").replace(/[^a-zA-Z0-9_]/g, "_")))];
  return React.createElement(ChartFrame, null,
    React.createElement(BarChart, { data: rows, margin: { top: 12, right: 20, bottom: 24, left: 8 } },
      React.createElement(CartesianGrid, { stroke: colors.grid, strokeDasharray: "3 3", vertical: false }),
      React.createElement(XAxis, { dataKey: "label", tick: { fill: colors.muted, fontSize: 10 }, angle: -24, textAnchor: "end", height: 48 }),
      React.createElement(YAxis, { tick: { fill: colors.muted, fontSize: 10 }, tickFormatter: (v) => number(v), width: 58 }),
      React.createElement(Tooltip, { content: React.createElement(FinanceTooltip, { kind: "liability" }) }),
      ...keys.map((key, index) => React.createElement(Bar, { key, dataKey: key, name: key.replace(/_/g, " "), stackId: "liability", fill: paletteFor(index, colors), isAnimationActive: false })),
      React.createElement(Legend, { wrapperStyle: { color: colors.text, fontSize: 11 } }),
    ),
  );
}

function WaterfallView({ payload, colors, labels }) {
  const values = (payload.values || []).map((item) => ({ ...item, value: Number(item.value || 0) }));
  return React.createElement(ChartFrame, null,
    React.createElement(BarChart, { data: values, margin: { top: 18, right: 20, bottom: 24, left: 8 } },
      React.createElement(CartesianGrid, { stroke: colors.grid, strokeDasharray: "3 3", vertical: false }),
      React.createElement(XAxis, { dataKey: "label", tick: { fill: colors.muted, fontSize: 10 }, interval: 0 }),
      React.createElement(YAxis, { tick: { fill: colors.muted, fontSize: 10 }, tickFormatter: (v) => number(v), width: 58 }),
      React.createElement(ReferenceLine, { y: 0, stroke: colors.muted }),
      React.createElement(Tooltip, { content: React.createElement(FinanceTooltip, { kind: "waterfall" }) }),
      React.createElement(Bar, { dataKey: "value", name: "Amount", radius: [4, 4, 0, 0], isAnimationActive: false, label: labels ? { position: "top", fill: colors.text, fontSize: 10, formatter: (v) => number(v) } : false }, values.map((item, index) => React.createElement(Cell, { key: `${item.label}-${index}`, fill: item.kind === "negative" ? colors.amber : item.kind === "variance" ? colors.danger : colors.accent }))),
    ),
  );
}

function HeatmapView({ payload, colors }) {
  const values = Array.isArray(payload.values) ? payload.values : [];
  const branches = [...new Set(values.map((item) => String(item.branch || "")))];
  const dates = [...new Set(values.map((item) => String(item.date || "")))];
  const color = (value) => Number(value) >= 94 ? colors.accent2 : Number(value) >= 92 ? colors.accent : Number(value) >= 90 ? colors.amber : colors.danger;
  return React.createElement("div", { className: "recharts-heatmap", style: { gridTemplateColumns: `minmax(130px, 1.2fr) repeat(${Math.max(dates.length, 1)}, minmax(72px, 1fr))` } },
    React.createElement("div", { className: "recharts-heatmap-cell header" }, "Branch / period"),
    ...dates.map((date) => React.createElement("div", { className: "recharts-heatmap-cell header", key: date }, date)),
    ...branches.flatMap((branch) => [
      React.createElement("div", { className: "recharts-heatmap-cell row-label", key: `${branch}-label` }, branch),
      ...dates.map((date) => {
        const item = values.find((entry) => String(entry.branch) === branch && String(entry.date) === date);
        const value = Number(item?.retention || 0);
        return React.createElement("button", { className: "recharts-heatmap-cell value", type: "button", key: `${branch}-${date}`, style: { background: color(value) }, title: `${branch} · ${date}: ${number(value)}%`, onClick: () => emitSelection(payload.panelId, branch) }, `${number(value)}%`);
      }),
    ]),
  );
}

function FinanceChart({ panelId, kind, payload = {}, colors = fallbackColors }) {
  const labels = Boolean(payload.labels);
  if (kind === "commission-state-pie") return React.createElement(PieView, { panelId, payload, colors, labels });
  if (kind === "tier-pie") return React.createElement(TierPieView, { panelId, payload, colors, labels });
  if (kind === "pitstop-total") return React.createElement(PitstopTotalView, { panelId, payload, colors, labels });
  if (kind === "ranked" || kind === "reimbursement-ranking" || kind === "commission-status-ranked") return React.createElement(RankedView, { panelId, kind, payload, colors, labels });
  if (kind === "branch-bridge" || kind === "channel-comparison") return React.createElement(GroupedView, { kind, payload, colors, labels });
  if (kind === "trend") return React.createElement(TrendView, { payload, colors, labels });
  if (kind === "pitstop-state-trend") return React.createElement(PitstopStateTrendView, { payload, colors });
  if (kind === "liability") return React.createElement(LiabilityView, { payload, colors });
  if (kind === "branch-waterfall") return React.createElement(WaterfallView, { payload, colors, labels });
  if (kind === "heatmap") return React.createElement(HeatmapView, { payload, colors });
  return React.createElement(RankedView, { panelId, kind, payload, colors, labels });
}

function mount(host, kind, payload, colors) {
  if (!host) return;
  if (!host.__financeRechartsRoot) host.__financeRechartsRoot = createRoot(host);
  const nextPayload = { ...(payload || {}), panelId: host.dataset.vchartPanel || "" };
  host.__financeRechartsRoot.render(React.createElement(FinanceChart, { panelId: nextPayload.panelId, kind, payload: nextPayload, colors: { ...fallbackColors, ...(colors || {}) } }));
  host.dataset.vchartMounted = "true";
  host.dataset.rechartsMounted = "true";
}

function release(host) {
  try { host?.__financeRechartsRoot?.unmount(); } catch {}
  if (host) {
    delete host.__financeRechartsRoot;
    delete host.dataset.vchartMounted;
    delete host.dataset.rechartsMounted;
  }
}

window.FinanceRecharts = { mount, release };
