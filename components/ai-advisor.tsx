"use client";

import { Bot, Send } from "lucide-react";
import { FormEvent, useState } from "react";

type AiAdvisorProps = {
  assistant: string;
  department: string;
  question: string;
  answer: string;
  evidence: string;
  risks?: string[];
  recommendedActions?: string[];
  isLoading?: boolean;
  onAsk?: (message: string) => Promise<void>;
};

export function AiAdvisor({
  assistant,
  department,
  question,
  answer,
  evidence,
  risks = [],
  recommendedActions = [],
  isLoading = false,
  onAsk
}: AiAdvisorProps) {
  const [message, setMessage] = useState(question);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onAsk || message.trim().length < 2) {
      return;
    }
    await onAsk(message);
  }

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-ink text-white">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{assistant}</h2>
            <p className="text-sm text-ink/60">{department} data, tenant-scoped evidence</p>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div className="rounded-md bg-field p-3">
          <p className="text-sm font-semibold">{question}</p>
        </div>
        <div className="rounded-md border border-line p-3">
          <p className="text-sm leading-6 text-ink/75">{answer}</p>
          <p className="mt-3 rounded-md bg-skyglass px-3 py-2 text-xs font-medium leading-5 text-palm">
            Evidence: {evidence}
          </p>
          {(risks.length > 0 || recommendedActions.length > 0) && (
            <div className="mt-3 grid gap-2 text-xs leading-5 md:grid-cols-2">
              {risks.length > 0 && (
                <div className="rounded-md bg-red-50 p-3 text-danger">
                  <p className="font-semibold">Risks</p>
                  <p>{risks.join(" ")}</p>
                </div>
              )}
              {recommendedActions.length > 0 && (
                <div className="rounded-md bg-field p-3 text-ink/75">
                  <p className="font-semibold text-ink">Next actions</p>
                  <p>{recommendedActions.join(" ")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <form className="mt-4 flex gap-2" onSubmit={handleSubmit}>
        <input
          aria-label="Ask AI advisor"
          className="min-h-11 flex-1 rounded-md border border-line bg-field px-3 text-sm outline-none focus:border-palm"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={`Ask ${assistant} about KPIs, risks, or next actions`}
        />
        <button
          className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-palm text-white disabled:cursor-not-allowed disabled:bg-ink/30"
          aria-label="Send question"
          disabled={isLoading}
          type="submit"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
