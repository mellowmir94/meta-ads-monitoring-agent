import assert from "node:assert/strict";
import { test } from "node:test";
import { askDepartmentAssistant, generateVisualRequest } from "@/lib/department-intelligence";
import type { TenantContext } from "@/lib/tenant";

const executiveContext: TenantContext = {
  tenantId: "tenant_klang_valley_trading",
  userId: "user_demo_executive",
  role: "Executive"
};

test("visual request can route to the right department from prompt intent", () => {
  const result = generateVisualRequest(executiveContext, "Executive", "Show debtor aging by customer");

  assert.equal(result.department, "Finance");
  assert.equal(result.title, "Debtor aging by customer");
  assert.ok(result.evidence.includes("Customer ledger"));
});

test("visual request changes chart payload for different prompts in the same department", () => {
  const expenses = generateVisualRequest(executiveContext, "Finance", "Generate a chart of expenses by category");
  const cashFlow = generateVisualRequest(executiveContext, "Finance", "Show cash flow trend");

  assert.equal(expenses.department, "Finance");
  assert.equal(cashFlow.department, "Finance");
  assert.equal(expenses.title, "Expenses by category");
  assert.equal(cashFlow.title, "Cash flow trend");
  assert.equal(expenses.chartType, "bar");
  assert.equal(cashFlow.chartType, "line");
  assert.notDeepEqual(expenses.chartData, cashFlow.chartData);
});

test("department assistant returns evidence and next actions", () => {
  const result = askDepartmentAssistant(
    executiveContext,
    "Operations",
    "What caused the stockout spike?",
    "Visualize stockout risk"
  );

  assert.equal(result.assistant, "Operations AI");
  assert.equal(result.department, "Operations");
  assert.ok(result.evidence.length >= 2);
  assert.ok(result.recommendedActions.some((action) => action.includes("Reorder")));
});

test("viewer cannot call department AI", () => {
  const viewerContext: TenantContext = {
    ...executiveContext,
    role: "Viewer"
  };

  assert.throws(() =>
    askDepartmentAssistant(viewerContext, "Finance", "What should I do?", "Show debtor aging")
  );
});
