import { listApplications } from "@/lib/application-repository";
import { getAuthRequiredMessage } from "@/lib/auth-context";
import { resolveServerUserScope } from "@/lib/auth-session";
import { buildResumeVersionHistory, summarizeResumeVersionHistory } from "@/lib/resume-version-history";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const result = await listApplications(userScope);
  const versions = buildResumeVersionHistory(result.data);

  return NextResponse.json({
    versions,
    summary: summarizeResumeVersionHistory(versions),
    storage: result.storage,
    warning: result.warning,
    userScope: userScope.source,
    note: "Resume version history is projected from saved applications so each version keeps its job, score, PDF, cover letter, and tracker context."
  });
}
