import { generateTailoredApplicationAssetsWithAi } from "@/lib/ai-tailoring";
import { saveAiInteraction } from "@/lib/ai-interaction-repository";
import { buildAiTailoringInteractionInput } from "@/lib/ai-interaction-store";
import { analyzeJobAgainstResume, parseResumeProfile, type JobListing } from "@/lib/applysharp";
import { getAuthRequiredMessage } from "@/lib/auth-context";
import { resolveServerUserScope } from "@/lib/auth-session";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  resumeText: z.string().min(50).max(120_000),
  job: z.object({
    id: z.string(),
    title: z.string().min(2),
    company: z.string().min(2),
    companyType: z.enum(["MNC", "SME", "Startup", "Agency", "GLC", "Other"]),
    category: z.enum(["MNC", "SME", "Fresh Graduate", "Remote", "Internship", "Contract", "Others"]),
    location: z.string().min(2),
    distanceKmFromBukitJelutong: z.number().min(0).optional(),
    estimatedCommuteMinutes: z.number().int().min(0).optional(),
    mapLink: z.string().url().optional(),
    salary: z.string().default("Not disclosed"),
    source: z.string().default("Manual"),
    sourcePlatform: z.enum(["JobStreet", "Indeed", "LinkedIn", "Company Site", "Public Listing"]),
    workMode: z.enum(["Remote", "Hybrid", "On-site"]),
    experienceLevel: z.enum(["Fresh Graduate", "Entry", "Junior", "Mid", "Senior"]),
    applyLink: z.string().url().or(z.literal("")),
    hrEmail: z.string().email().optional(),
    requirements: z.array(z.string()).default([]),
    responsibilities: z.array(z.string()).default([]),
    atsKeywords: z.array(z.string()).default([]),
    postedAgeDays: z.number().int().min(0).default(0)
  })
});

export async function POST(request: Request) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid tailoring payload",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const profile = parseResumeProfile(parsed.data.resumeText);
  const job = parsed.data.job as JobListing;
  const fit = analyzeJobAgainstResume(profile, job);
  const aiTailoring = await generateTailoredApplicationAssetsWithAi(parsed.data.resumeText, job, fit);
  const aiInteraction = await saveAiInteraction(
    buildAiTailoringInteractionInput({
      intent: "resume-tailoring",
      resumeText: parsed.data.resumeText,
      job,
      fit,
      aiTailoring
    }),
    userScope
  );

  return NextResponse.json({
    fit,
    assets: aiTailoring.assets,
    aiTailoring: {
      provider: aiTailoring.provider,
      model: aiTailoring.model,
      promptHash: aiTailoring.promptHash,
      usedFallback: aiTailoring.usedFallback,
      fallbackReason: aiTailoring.fallbackReason,
      warnings: aiTailoring.warnings
    },
    aiInteraction: {
      id: aiInteraction.data.id,
      storage: aiInteraction.storage,
      warning: aiInteraction.warning,
      userScope: userScope.source,
      note: "Metadata-only log. Raw resume and JD text are not stored."
    },
    editable: true,
    download: {
      format: "pdf",
      endpoint: "/api/resumes/pdf",
      note: "POST the editable resume markdown to this endpoint to download an ATS-safe PDF."
    }
  });
}
