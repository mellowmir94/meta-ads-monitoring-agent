import {
  departmentWorkspaces,
  type DepartmentKey,
  type DepartmentWorkspace,
  type ExecutiveKpi
} from "@/lib/seed-data";
import { assertPermission, type Permission } from "@/lib/rbac";
import type { TenantContext } from "@/lib/tenant";

export type VisualResult = {
  department: DepartmentKey;
  prompt: string;
  title: string;
  subtitle: string;
  chartType: "bar" | "line";
  chartData: Array<{ label: string; value: number }>;
  kpis: ExecutiveKpi[];
  evidence: string;
};

export type AiAdvisorResult = {
  interactionId: string;
  assistant: string;
  department: DepartmentKey;
  summary: string;
  evidence: string[];
  risks: string[];
  recommendedActions: string[];
  caveats: string[];
};

const departmentPermission: Record<DepartmentKey, Permission> = {
  Executive: "dashboard:read",
  Finance: "finance:read",
  Sales: "sales:read",
  Operations: "operations:read",
  HR: "hr:read",
  Procurement: "procurement:read",
  Support: "support:read"
};

const visualAliases: Array<{
  match: RegExp;
  department: DepartmentKey;
}> = [
  { match: /debtor|aging|cash|expense|margin/i, department: "Finance" },
  { match: /sales|revenue|pipeline|win rate|conversion|customer/i, department: "Sales" },
  { match: /stock|inventory|fulfillment|branch performance|backlog/i, department: "Operations" },
  { match: /employee|turnover|headcount|absentee|training|hiring/i, department: "HR" },
  { match: /vendor|supplier|purchase|procurement|delivery/i, department: "Procurement" },
  { match: /support|sla|ticket|response|resolution/i, department: "Support" }
];

type VisualPreset = {
  match: RegExp;
  department: DepartmentKey;
  title: string;
  subtitle: string;
  chartType: "bar" | "line";
  chartData: Array<{ label: string; value: number }>;
  evidence: string;
};

const visualPresets: VisualPreset[] = [
  {
    match: /sales.*branch|revenue.*branch|branch.*revenue|branch.*sales/i,
    department: "Sales",
    title: "Sales by branch",
    subtitle: "Closed revenue by Malaysian branch, MYR",
    chartType: "bar",
    chartData: [
      { label: "Klang Valley", value: 920000 },
      { label: "Penang", value: 610000 },
      { label: "Johor", value: 480000 },
      { label: "Sabah", value: 310000 },
      { label: "Sarawak", value: 270000 }
    ],
    evidence: "12,480 tenant transaction rows grouped by branch for current month."
  },
  {
    match: /month over month|mom|monthly|revenue trend|compare revenue/i,
    department: "Sales",
    title: "Revenue month over month",
    subtitle: "Closed revenue trend, MYR",
    chartType: "line",
    chartData: [
      { label: "Jan", value: 2150000 },
      { label: "Feb", value: 2280000 },
      { label: "Mar", value: 2410000 },
      { label: "Apr", value: 2520000 },
      { label: "May", value: 2840000 }
    ],
    evidence: "Monthly revenue snapshots from normalized transaction rows."
  },
  {
    match: /top.*customer|customer.*revenue|customers.*revenue/i,
    department: "Sales",
    title: "Top customers by revenue",
    subtitle: "Top 10 B2B customers, MYR",
    chartType: "bar",
    chartData: [
      { label: "Jaya B2B", value: 388000 },
      { label: "Penang Precision", value: 312000 },
      { label: "Johor Retail", value: 284000 },
      { label: "East Coast Trade", value: 172000 },
      { label: "Sarawak Services", value: 146000 }
    ],
    evidence: "Customer revenue grouped from tenant transaction rows, current quarter."
  },
  {
    match: /debtor|aging|receivable|collection/i,
    department: "Finance",
    title: "Debtor aging by customer",
    subtitle: "Outstanding receivables, MYR",
    chartType: "bar",
    chartData: [
      { label: "Jaya B2B", value: 168000 },
      { label: "Johor Retail", value: 132000 },
      { label: "Penang Precision", value: 84000 },
      { label: "East Coast Trade", value: 34000 }
    ],
    evidence: "Customer ledger rows filtered to invoices over 60 days."
  },
  {
    match: /expense|expenses.*category|opex|cost category/i,
    department: "Finance",
    title: "Expenses by category",
    subtitle: "SST-aware operating expenses, MYR",
    chartType: "bar",
    chartData: [
      { label: "Payroll", value: 420000 },
      { label: "Logistics", value: 188000 },
      { label: "Rent", value: 146000 },
      { label: "Utilities", value: 62000 },
      { label: "Software", value: 39000 }
    ],
    evidence: "Finance transaction rows grouped by SST-aware expense category."
  },
  {
    match: /cash.*flow|cashflow|net cash/i,
    department: "Finance",
    title: "Cash flow trend",
    subtitle: "Net operating cash by month, MYR",
    chartType: "line",
    chartData: [
      { label: "Jan", value: 310000 },
      { label: "Feb", value: 285000 },
      { label: "Mar", value: 338000 },
      { label: "Apr", value: 301000 },
      { label: "May", value: 418000 }
    ],
    evidence: "Cash-in and cash-out transaction rows summarized by month."
  },
  {
    match: /stockout|stock.*risk|inventory.*risk|reorder/i,
    department: "Operations",
    title: "Stockout risk by branch",
    subtitle: "Fast-moving SKUs below reorder point",
    chartType: "bar",
    chartData: [
      { label: "Johor", value: 11 },
      { label: "Sabah", value: 7 },
      { label: "Klang Valley", value: 4 },
      { label: "Penang", value: 3 },
      { label: "Sarawak", value: 2 }
    ],
    evidence: "InventoryItem rows where quantity is below reorder point."
  },
  {
    match: /fulfillment|order backlog|backlog/i,
    department: "Operations",
    title: "Order backlog by branch",
    subtitle: "Open orders past target handling time",
    chartType: "bar",
    chartData: [
      { label: "Johor", value: 29 },
      { label: "Klang Valley", value: 18 },
      { label: "Sabah", value: 14 },
      { label: "Penang", value: 8 },
      { label: "Sarawak", value: 5 }
    ],
    evidence: "Open order rows grouped by branch and target handling time."
  },
  {
    match: /turnover|employee.*trend|leaver|workforce/i,
    department: "HR",
    title: "Employee turnover trend",
    subtitle: "Monthly leavers",
    chartType: "line",
    chartData: [
      { label: "Jan", value: 3 },
      { label: "Feb", value: 4 },
      { label: "Mar", value: 2 },
      { label: "Apr", value: 6 },
      { label: "May", value: 5 }
    ],
    evidence: "Employee records grouped by leaver month and branch."
  },
  {
    match: /headcount|hiring|staff/i,
    department: "HR",
    title: "Headcount by department",
    subtitle: "Active employees",
    chartType: "bar",
    chartData: [
      { label: "Operations", value: 68 },
      { label: "Sales", value: 42 },
      { label: "Support", value: 31 },
      { label: "Finance", value: 18 },
      { label: "HR", value: 9 }
    ],
    evidence: "Active Employee rows grouped by department."
  },
  {
    match: /vendor|supplier|delivery|on-time|on time/i,
    department: "Procurement",
    title: "Supplier on-time rate",
    subtitle: "Purchase orders delivered on schedule",
    chartType: "bar",
    chartData: [
      { label: "Shah Alam Packaging", value: 96 },
      { label: "Penang Electronics", value: 89 },
      { label: "Sabah Logistics", value: 82 },
      { label: "Sarawak Services", value: 91 }
    ],
    evidence: "PurchaseOrder expected and received dates grouped by vendor."
  },
  {
    match: /sla|breach|support.*week|ticket/i,
    department: "Support",
    title: "SLA breaches by week",
    subtitle: "Support tickets breaching first response SLA",
    chartType: "bar",
    chartData: [
      { label: "W1", value: 4 },
      { label: "W2", value: 7 },
      { label: "W3", value: 5 },
      { label: "W4", value: 9 }
    ],
    evidence: "SupportTicket rows with SLA breach flags grouped by week."
  },
  {
    match: /response time|resolution time|first response/i,
    department: "Support",
    title: "Support response trend",
    subtitle: "Median first response minutes",
    chartType: "line",
    chartData: [
      { label: "W1", value: 31 },
      { label: "W2", value: 36 },
      { label: "W3", value: 34 },
      { label: "W4", value: 42 }
    ],
    evidence: "SupportTicket first response minutes grouped by week."
  }
];

export function getDepartmentWorkspace(department: DepartmentKey) {
  return departmentWorkspaces.find((workspace) => workspace.department === department) ?? departmentWorkspaces[0];
}

export function getDepartmentsForRole(context: TenantContext) {
  return departmentWorkspaces.filter((workspace) => {
    try {
      assertPermission(context.role, departmentPermission[workspace.department]);
      return true;
    } catch {
      return false;
    }
  });
}

export function generateVisualRequest(context: TenantContext, department: DepartmentKey, prompt: string): VisualResult {
  assertPermission(context.role, "dashboard:read");

  const preset = visualPresets.find((candidate) => candidate.match.test(prompt));
  const requestedDepartment =
    preset?.department ?? visualAliases.find((alias) => alias.match.test(prompt))?.department ?? department;
  assertPermission(context.role, departmentPermission[requestedDepartment]);

  const workspace = getDepartmentWorkspace(requestedDepartment);
  const selectedVisual = preset ?? {
    title: workspace.visualTitle,
    subtitle: workspace.visualSubtitle,
    chartType: workspace.chartType,
    chartData: workspace.chartData,
    evidence: workspace.evidence
  };

  return {
    department: requestedDepartment,
    prompt,
    title: selectedVisual.title,
    subtitle: selectedVisual.subtitle,
    chartType: selectedVisual.chartType,
    chartData: selectedVisual.chartData,
    kpis: workspace.kpis,
    evidence: selectedVisual.evidence
  };
}

export function askDepartmentAssistant(
  context: TenantContext,
  department: DepartmentKey,
  message: string,
  visualPrompt: string
): AiAdvisorResult {
  assertPermission(context.role, "ai:chat");
  assertPermission(context.role, departmentPermission[department]);

  const workspace = getDepartmentWorkspace(department);

  return {
    interactionId: `ai_${context.tenantId}_${department.toLowerCase()}_${Date.now()}`,
    assistant: workspace.assistant,
    department,
    summary: shapeDepartmentAnswer(workspace, message, visualPrompt),
    evidence: [workspace.evidence, `${workspace.visualTitle}: ${workspace.chartData.length} grouped data points`],
    risks: deriveRisks(workspace),
    recommendedActions: deriveActions(workspace),
    caveats: [
      "Response uses current demo tenant structured data only.",
      "Sensitive HR/customer/financial fields are summarized before provider calls."
    ]
  };
}

function shapeDepartmentAnswer(workspace: DepartmentWorkspace, message: string, visualPrompt: string) {
  const topic = message.trim() || workspace.chatQuestion;
  return `${workspace.assistant} reviewed "${topic}" against "${visualPrompt}". ${workspace.chatAnswer}`;
}

function deriveRisks(workspace: DepartmentWorkspace) {
  if (workspace.department === "Finance") {
    return ["Cash collection pressure from aged receivables.", "Margin pressure if overdue customers remain unresolved."];
  }
  if (workspace.department === "Operations") {
    return ["Stockout risk can suppress branch revenue.", "Replenishment delays may affect SLA and customer retention."];
  }
  if (workspace.department === "HR") {
    return ["Turnover and absenteeism can reduce branch coverage.", "Scheduling gaps may increase operational pressure."];
  }
  if (workspace.department === "Procurement") {
    return ["Late supplier delivery can trigger stockout risk.", "Vendor concentration may weaken fulfillment reliability."];
  }
  if (workspace.department === "Support") {
    return ["SLA breach clusters can affect customer retention.", "Priority mix may exceed current response capacity."];
  }
  if (workspace.department === "Sales") {
    return ["Pipeline quality may vary by branch.", "Forecast accuracy depends on updated opportunity stages."];
  }
  return ["Branch underperformance may combine revenue, inventory, staffing, and service factors."];
}

function deriveActions(workspace: DepartmentWorkspace) {
  if (workspace.department === "Finance") {
    return ["Prioritize collection calls for highest MYR overdue customers.", "Review credit terms for repeat late payers."];
  }
  if (workspace.department === "Operations") {
    return ["Reorder fast-moving Johor SKUs first.", "Compare weekend staffing with Klang Valley branch coverage."];
  }
  if (workspace.department === "HR") {
    return ["Review branch schedules and absenteeism clusters.", "Focus retention checks on teams with rising leavers."];
  }
  if (workspace.department === "Procurement") {
    return ["Escalate Sabah Logistics Partner delivery performance.", "Add backup suppliers for replenishment-critical SKUs."];
  }
  if (workspace.department === "Support") {
    return ["Add coverage during breach-prone periods.", "Separate Sabah logistics queue for faster triage."];
  }
  if (workspace.department === "Sales") {
    return ["Focus next-week activity on higher-probability Penang opportunities.", "Refresh stale Johor retail opportunity stages."];
  }
  return ["Review Johor replenishment, weekend staffing, and revenue trend together.", "Assign an owner for each critical anomaly."];
}
