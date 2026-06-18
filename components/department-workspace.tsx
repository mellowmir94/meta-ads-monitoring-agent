"use client";

import { AiAdvisor } from "@/components/ai-advisor";
import { ChartPanel } from "@/components/chart-panel";
import { KpiCard } from "@/components/kpi-card";
import { departmentWorkspaces, type DepartmentKey, type ExecutiveKpi } from "@/lib/seed-data";
import clsx from "clsx";
import { BarChart3, MessageSquareText } from "lucide-react";
import { useState } from "react";

type VisualState = {
  title: string;
  subtitle: string;
  chartType: "bar" | "line";
  chartData: Array<{ label: string; value: number }>;
  kpis: ExecutiveKpi[];
  evidence: string;
};

type ChatState = {
  question: string;
  answer: string;
  evidence: string;
  risks: string[];
  recommendedActions: string[];
};

export function DepartmentWorkspace() {
  const initialWorkspace = departmentWorkspaces[0];
  const [activeDepartment, setActiveDepartment] = useState<DepartmentKey>(initialWorkspace.department);
  const [visualRequest, setVisualRequest] = useState(initialWorkspace.visualRequest);
  const [visual, setVisual] = useState<VisualState>({
    title: initialWorkspace.visualTitle,
    subtitle: initialWorkspace.visualSubtitle,
    chartType: initialWorkspace.chartType,
    chartData: initialWorkspace.chartData,
    kpis: initialWorkspace.kpis,
    evidence: initialWorkspace.evidence
  });
  const [chat, setChat] = useState<ChatState>({
    question: initialWorkspace.chatQuestion,
    answer: initialWorkspace.chatAnswer,
    evidence: initialWorkspace.evidence,
    risks: [],
    recommendedActions: []
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workspace =
    departmentWorkspaces.find((item) => item.department === activeDepartment) ?? initialWorkspace;

  function selectDepartment(departmentWorkspace: typeof initialWorkspace) {
    setActiveDepartment(departmentWorkspace.department);
    setVisualRequest(departmentWorkspace.visualRequest);
    setVisual({
      title: departmentWorkspace.visualTitle,
      subtitle: departmentWorkspace.visualSubtitle,
      chartType: departmentWorkspace.chartType,
      chartData: departmentWorkspace.chartData,
      kpis: departmentWorkspace.kpis,
      evidence: departmentWorkspace.evidence
    });
    setChat({
      question: departmentWorkspace.chatQuestion,
      answer: departmentWorkspace.chatAnswer,
      evidence: departmentWorkspace.evidence,
      risks: [],
      recommendedActions: []
    });
    setError(null);
  }

  async function generateVisual() {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/visual-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: activeDepartment,
          prompt: visualRequest
        })
      });

      if (!response.ok) {
        throw new Error("Visual request failed.");
      }

      const result = await response.json();
      setActiveDepartment(result.department);
      setVisual({
        title: result.title,
        subtitle: result.subtitle,
        chartType: result.chartType,
        chartData: result.chartData,
        kpis: result.kpis,
        evidence: result.evidence
      });
      setChat((current) => ({
        ...current,
        evidence: result.evidence
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Visual request failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function askAssistant(message: string) {
    setIsChatting(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: activeDepartment,
          message,
          visualPrompt: visualRequest
        })
      });

      if (!response.ok) {
        throw new Error("AI advisor request failed.");
      }

      const result = await response.json();
      setChat({
        question: message,
        answer: result.summary,
        evidence: result.evidence.join(" "),
        risks: result.risks,
        recommendedActions: result.recommendedActions
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI advisor request failed.");
    } finally {
      setIsChatting(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-palm">Department intelligence</p>
            <h2 className="mt-1 text-xl font-semibold">Choose a department, then ask its AI</h2>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {departmentWorkspaces.map((item) => (
              <button
                key={item.department}
                type="button"
                onClick={() => selectDepartment(item)}
                className={clsx(
                  "min-h-10 whitespace-nowrap rounded-md border px-3 text-sm font-semibold",
                  item.department === activeDepartment
                    ? "border-palm bg-palm text-white"
                    : "border-line bg-field text-ink/70"
                )}
              >
                {item.department}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Requested visual</h2>
            <p className="text-sm text-ink/60">The KPI cards below follow the selected department and visual request.</p>
          </div>
          <BarChart3 className="h-5 w-5 text-palm" />
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            className="min-h-11 flex-1 rounded-md border border-line bg-field px-3 text-sm outline-none focus:border-palm"
            value={visualRequest}
            onChange={(event) => setVisualRequest(event.target.value)}
            aria-label="Visual request"
          />
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-palm px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink/30"
            onClick={generateVisual}
            disabled={isGenerating}
            type="button"
          >
            <MessageSquareText className="h-4 w-4" />
            {isGenerating ? "Generating" : "Generate"}
          </button>
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-danger">{error}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visual.kpis.map((kpi) => (
          <KpiCard key={`${workspace.department}-${kpi.name}`} kpi={kpi} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <ChartPanel
          title={visual.title}
          subtitle={visual.subtitle}
          type={visual.chartType}
          data={visual.chartData}
        />
        <AiAdvisor
          assistant={workspace.assistant}
          department={workspace.department}
          question={chat.question}
          answer={chat.answer}
          evidence={chat.evidence}
          risks={chat.risks}
          recommendedActions={chat.recommendedActions}
          isLoading={isChatting}
          onAsk={askAssistant}
        />
      </div>
    </section>
  );
}
