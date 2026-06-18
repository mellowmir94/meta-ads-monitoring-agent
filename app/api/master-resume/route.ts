import { deleteMasterResume, getActiveMasterResume, listMasterResumes, saveMasterResume } from "@/lib/master-resume-repository";
import { getAuthRequiredMessage } from "@/lib/auth-context";
import { resolveServerUserScope } from "@/lib/auth-session";
import { summarizeMasterResumes } from "@/lib/master-resume-store";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const saveMasterResumeSchema = z.object({
  title: z.string().max(180).optional(),
  resumeText: z.string().min(50).max(120_000),
  source: z.enum(["paste", "upload", "import"]).default("paste"),
  originalFileName: z.string().max(240).optional(),
  fileType: z.string().max(120).optional(),
  sizeBytes: z.number().int().min(0).optional()
});

export async function GET(request: Request) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const [activeResult, listResult] = await Promise.all([getActiveMasterResume(userScope), listMasterResumes(userScope)]);

  return NextResponse.json({
    active: activeResult.data,
    resumes: listResult.data,
    summary: summarizeMasterResumes(listResult.data),
    storage: activeResult.storage,
    warning: activeResult.warning ?? listResult.warning,
    userScope: userScope.source,
    note: "The active master resume is the source of truth for tailoring. Do not add unsupported experience."
  });
}

export async function POST(request: Request) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const parsed = saveMasterResumeSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid master resume payload",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const result = await saveMasterResume({
    title: parsed.data.title,
    rawText: parsed.data.resumeText,
    source: parsed.data.source,
    originalFileName: parsed.data.originalFileName,
    fileType: parsed.data.fileType,
    sizeBytes: parsed.data.sizeBytes
  }, userScope);

  return NextResponse.json({ masterResume: result.data, storage: result.storage, warning: result.warning, userScope: userScope.source }, { status: 201 });
}

export async function DELETE(request: Request) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing master resume id." }, { status: 400 });
  }

  try {
    const result = await deleteMasterResume(id, userScope);

    return NextResponse.json({ masterResume: result.data, deleted: true, storage: result.storage, warning: result.warning, userScope: userScope.source });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Master resume delete failed"
      },
      { status: 404 }
    );
  }
}
