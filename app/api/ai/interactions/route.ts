import { listAiInteractions } from "@/lib/ai-interaction-repository";
import { summarizeAiInteractions } from "@/lib/ai-interaction-store";
import { getAuthRequiredMessage } from "@/lib/auth-context";
import { resolveServerUserScope } from "@/lib/auth-session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const result = await listAiInteractions(userScope);

  return NextResponse.json({
    interactions: result.data,
    summary: summarizeAiInteractions(result.data),
    storage: result.storage,
    warning: result.warning,
    userScope: userScope.source,
    note: "AI interaction logs are metadata-only. Raw resumes, JDs, prompts, and generated documents are not stored here."
  });
}
