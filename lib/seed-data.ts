export type ExecutiveKpi = {
  name: string;
  value: string;
  trend: number;
  evidence: string;
};

export type DepartmentKey =
  | "Executive"
  | "Finance"
  | "Sales"
  | "Operations"
  | "HR"
  | "Procurement"
  | "Support";

export type DepartmentWorkspace = {
  department: DepartmentKey;
  assistant: string;
  visualRequest: string;
  visualTitle: string;
  visualSubtitle: string;
  chartType: "bar" | "line";
  chartData: Array<{ label: string; value: number }>;
  kpis: ExecutiveKpi[];
  chatQuestion: string;
  chatAnswer: string;
  evidence: string;
};

export const tenantProfile = {
  name: "Klang Valley Trading Sdn Bhd",
  entityType: "Sdn Bhd",
  region: "Klang Valley",
  currency: "MYR"
};

export const executiveKpis: ExecutiveKpi[] = [
  {
    name: "Company health score",
    value: "82",
    trend: 4.8,
    evidence: "Weighted from revenue, cash, stockout risk, SLA, and debtor aging snapshots."
  },
  {
    name: "Revenue",
    value: "MYR 2.84M",
    trend: 7.2,
    evidence: "12,480 tenant transaction rows, current month period."
  },
  {
    name: "Gross margin",
    value: "31.6%",
    trend: -2.1,
    evidence: "Margin pressure from Johor retail and Penang distributor channels."
  },
  {
    name: "SLA compliance",
    value: "94.1%",
    trend: 1.3,
    evidence: "Support ticket SLA records across KL, Sabah, and Sarawak offices."
  }
];

export const branchRevenue = [
  { label: "Klang Valley", value: 920000 },
  { label: "Penang", value: 610000 },
  { label: "Johor", value: 480000 },
  { label: "Sabah", value: 310000 },
  { label: "Sarawak", value: 270000 }
];

export const monthlyRevenue = [
  { label: "Jan", value: 2150000 },
  { label: "Feb", value: 2280000 },
  { label: "Mar", value: 2410000 },
  { label: "Apr", value: 2520000 },
  { label: "May", value: 2840000 }
];

export const dashboardAlerts = [
  {
    department: "Finance",
    severity: "Warning",
    metric: "Debtor aging",
    explanation: "Receivables over 60 days rose to MYR 418k, above the warning threshold."
  },
  {
    department: "Operations",
    severity: "Critical",
    metric: "Stockout risk",
    explanation: "Johor branch has 11 fast-moving SKUs below reorder baseline."
  },
  {
    department: "Support",
    severity: "Watch",
    metric: "SLA breach cluster",
    explanation: "Sabah logistics tickets breached first response SLA twice this week."
  }
];

export const datasetTypes = [
  "Finance transactions",
  "Sales pipeline",
  "Customers",
  "Inventory",
  "Purchase orders",
  "Vendors",
  "Employees",
  "Support tickets",
  "Branch performance"
];

export const sampleImports = [
  {
    name: "may-sales-branch.csv",
    type: "Finance transactions",
    rows: 12480,
    tenant: "Klang Valley Trading Sdn Bhd",
    status: "Mapped"
  },
  {
    name: "penang-electronics-stock.xlsx",
    type: "Inventory",
    rows: 1860,
    tenant: "Penang electronics distributor",
    status: "Previewed"
  },
  {
    name: "sabah-support-sla.csv",
    type: "Support tickets",
    rows: 742,
    tenant: "Sabah logistics branch",
    status: "Validated"
  }
];

export const departmentWorkspaces: DepartmentWorkspace[] = [
  {
    department: "Executive",
    assistant: "Executive AI",
    visualRequest: "Create KPI summary for management",
    visualTitle: "Revenue by branch",
    visualSubtitle: "Current month, MYR",
    chartType: "bar",
    chartData: branchRevenue,
    kpis: executiveKpis,
    chatQuestion: "Why is Johor underperforming?",
    chatAnswer:
      "Johor revenue is 14.2% below the branch average for the current month. Evidence points to stockout exposure on fast-moving SKUs and lower weekend staffing coverage versus Klang Valley.",
    evidence: "Branch revenue chart, 12,480 transaction rows, current month period, stockout anomaly."
  },
  {
    department: "Finance",
    assistant: "Finance AI",
    visualRequest: "Show debtor aging by customer",
    visualTitle: "Debtor aging by customer",
    visualSubtitle: "Outstanding receivables, MYR",
    chartType: "bar",
    chartData: [
      { label: "Jaya B2B", value: 168000 },
      { label: "Johor Retail", value: 132000 },
      { label: "Penang Precision", value: 84000 },
      { label: "East Coast Trade", value: 34000 }
    ],
    kpis: [
      { name: "Cash flow", value: "MYR 418k", trend: -5.4, evidence: "Operating cash movement from finance transactions." },
      { name: "Debtor aging", value: "MYR 418k", trend: -8.2, evidence: "Receivables over 60 days exceeded warning threshold." },
      { name: "Expense variance", value: "6.8%", trend: -1.9, evidence: "SST-aware expenses versus monthly operating budget." },
      { name: "Margin by channel", value: "31.6%", trend: -2.1, evidence: "Product/channel margin from normalized transaction rows." }
    ],
    chatQuestion: "Which customer should finance chase first?",
    chatAnswer:
      "Finance should prioritize Jaya B2B Supplies because it has the highest overdue exposure at MYR 168k and contributes materially to current cash-flow pressure.",
    evidence: "Debtor aging chart, customer ledger rows, MYR overdue balances, current month period."
  },
  {
    department: "Sales",
    assistant: "Sales AI",
    visualRequest: "Compare revenue month over month",
    visualTitle: "Monthly revenue trend",
    visualSubtitle: "Closed revenue, MYR",
    chartType: "line",
    chartData: monthlyRevenue,
    kpis: [
      { name: "Pipeline value", value: "MYR 3.2M", trend: 9.1, evidence: "Open SalesOpportunity records weighted by probability." },
      { name: "Win rate", value: "38.4%", trend: 2.6, evidence: "Closed won versus closed lost opportunities." },
      { name: "Average deal size", value: "MYR 42k", trend: 4.7, evidence: "Won opportunities across SME and distributor segments." },
      { name: "Forecast accuracy", value: "88.2%", trend: 1.4, evidence: "Forecast versus actual revenue by month." }
    ],
    chatQuestion: "Where should sales focus next week?",
    chatAnswer:
      "Sales should focus on Penang distributor opportunities because weighted pipeline is rising and conversion is stronger than Johor retail accounts.",
    evidence: "Sales pipeline records, branch trend chart, won/lost stage history."
  },
  {
    department: "Operations",
    assistant: "Operations AI",
    visualRequest: "Visualize stockout risk",
    visualTitle: "Stockout risk by branch",
    visualSubtitle: "Fast-moving SKUs below reorder point",
    chartType: "bar",
    chartData: [
      { label: "Johor", value: 11 },
      { label: "Sabah", value: 7 },
      { label: "Klang Valley", value: 4 },
      { label: "Penang", value: 3 },
      { label: "Sarawak", value: 2 }
    ],
    kpis: [
      { name: "Inventory turnover", value: "5.8x", trend: 3.2, evidence: "Inventory movement across branches." },
      { name: "Stockout risk", value: "11 SKUs", trend: -12.4, evidence: "Johor SKUs below reorder point." },
      { name: "Fulfillment time", value: "1.9 days", trend: 4.1, evidence: "Order dispatch and completion timestamps." },
      { name: "Order backlog", value: "74", trend: -3.8, evidence: "Open branch orders past target handling time." }
    ],
    chatQuestion: "What caused the Johor stockout spike?",
    chatAnswer:
      "The Johor spike is driven by 11 fast-moving SKUs below reorder point while branch demand stayed above its four-week average.",
    evidence: "InventoryItem rows, reorder points, branch demand trend, stockout anomaly."
  },
  {
    department: "HR",
    assistant: "HR AI",
    visualRequest: "Visualize employee turnover trend",
    visualTitle: "Employee turnover trend",
    visualSubtitle: "Monthly leavers",
    chartType: "line",
    chartData: [
      { label: "Jan", value: 3 },
      { label: "Feb", value: 4 },
      { label: "Mar", value: 2 },
      { label: "Apr", value: 6 },
      { label: "May", value: 5 }
    ],
    kpis: [
      { name: "Headcount", value: "186", trend: 1.1, evidence: "Active Employee records by department." },
      { name: "Turnover", value: "8.4%", trend: -2.8, evidence: "Leavers over average headcount." },
      { name: "Absenteeism", value: "3.1%", trend: -0.7, evidence: "Attendance import summary." },
      { name: "Training completion", value: "76%", trend: 5.5, evidence: "Training completion rows by branch." }
    ],
    chatQuestion: "Which workforce risk needs attention?",
    chatAnswer:
      "HR should review Johor retail scheduling because turnover and absenteeism both rose while weekend coverage remained thin.",
    evidence: "Employee records, attendance import summary, branch turnover trend."
  },
  {
    department: "Procurement",
    assistant: "Procurement AI",
    visualRequest: "Compare vendor delivery performance",
    visualTitle: "Supplier on-time rate",
    visualSubtitle: "Purchase orders delivered on schedule",
    chartType: "bar",
    chartData: [
      { label: "Shah Alam Packaging", value: 96 },
      { label: "Penang Electronics", value: 89 },
      { label: "Sabah Logistics", value: 82 },
      { label: "Sarawak Services", value: 91 }
    ],
    kpis: [
      { name: "Supplier on-time rate", value: "89.5%", trend: -1.6, evidence: "Received date versus expected date across purchase orders." },
      { name: "PO cycle time", value: "4.2 days", trend: 2.4, evidence: "Purchase order creation to approval timestamps." },
      { name: "Cost variance", value: "3.7%", trend: -0.9, evidence: "Actual vendor costs versus expected unit costs." },
      { name: "Vendor risk", value: "2 watch", trend: -1.2, evidence: "Vendor risk flags and late delivery clusters." }
    ],
    chatQuestion: "Which supplier needs escalation?",
    chatAnswer:
      "Sabah Logistics Partner needs escalation because on-time delivery is 82%, below the warning threshold, and recent late deliveries affect branch replenishment.",
    evidence: "PurchaseOrder rows, vendor delivery dates, supplier on-time chart."
  },
  {
    department: "Support",
    assistant: "Support AI",
    visualRequest: "Show support SLA breaches by week",
    visualTitle: "SLA breaches by week",
    visualSubtitle: "Support tickets breaching first response SLA",
    chartType: "bar",
    chartData: [
      { label: "W1", value: 4 },
      { label: "W2", value: 7 },
      { label: "W3", value: 5 },
      { label: "W4", value: 9 }
    ],
    kpis: [
      { name: "Ticket volume", value: "742", trend: 6.9, evidence: "SupportTicket rows this month." },
      { name: "First response", value: "38 min", trend: -4.4, evidence: "Median first response minutes." },
      { name: "Resolution time", value: "9.6 hr", trend: 2.1, evidence: "Resolved ticket duration." },
      { name: "SLA compliance", value: "94.1%", trend: 1.3, evidence: "Breached versus total support tickets." }
    ],
    chatQuestion: "Why did SLA breaches increase?",
    chatAnswer:
      "SLA breaches increased in week 4 due to Sabah logistics tickets clustering outside business-hour coverage, while priority mix also shifted upward.",
    evidence: "SupportTicket rows, SLA breach flags, weekly branch grouping."
  }
];
