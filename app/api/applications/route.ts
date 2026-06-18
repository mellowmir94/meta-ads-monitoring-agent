import {
  applicationStatuses,
  companyTypes,
  jobCategories,
  workModes,
  type FitResult,
  type JobListing
} from "@/lib/applysharp";
import { createApplication, listApplications } from "@/lib/application-repository";
import { getAuthRequiredMessage } from "@/lib/auth-context";
import { resolveServerUserScope } from "@/lib/auth-session";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const fitSchema = z.object({
  fitScore: z.number().int().min(0).max(100),
  atsScore: z.number().int().min(0).max(100),
  locationScore: z.number().int().min(0).max(100),
  decision: z.enum(["Strong Apply", "Apply", "Stretch", "Skip"]),
  missingKeywords: z.array(z.string()).default([]),
  matchedKeywords: z.array(z.string()).default([]),
  skillGaps: z.array(z.string()).default([]),
  recruiterConcerns: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([])
});

const jobSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(2),
  company: z.string().min(2),
  companyType: z.enum(companyTypes),
  category: z.enum(jobCategories),
  location: z.string().min(2),
  distanceKmFromBukitJelutong: z.number().min(0).optional(),
  estimatedCommuteMinutes: z.number().int().min(0).optional(),
  mapLink: z.string().url().optional(),
  salary: z.string().default("Not disclosed"),
  source: z.string().default("Manual"),
  sourcePlatform: z.enum(["JobStreet", "Indeed", "LinkedIn", "Company Site", "Public Listing"]),
  workMode: z.enum(workModes),
  experienceLevel: z.enum(["Fresh Graduate", "Entry", "Junior", "Mid", "Senior"]),
  applyLink: z.string().url().or(z.literal("")),
  hrEmail: z.string().email().optional(),
  requirements: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  atsKeywords: z.array(z.string()).default([]),
  postedAgeDays: z.number().int().min(0).default(0)
});

const createApplicationSchema = z.object({
  status: z.enum(applicationStatuses).default("saved"),
  job: jobSchema,
  fit: fitSchema,
  resumeMarkdown: z.string().max(120_000).optional(),
  pdfFileName: z.string().max(180).optional(),
  coverLetter: z.string().max(30_000).optional(),
  emailSubject: z.string().max(300).optional(),
  emailBody: z.string().max(30_000).optional(),
  note: z.string().max(1_000).optional()
});

export async function GET(request: Request) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const result = await listApplications(userScope);

  return NextResponse.json({
    applications: result.data,
    storage: result.storage,
    warning: result.warning,
    userScope: userScope.source,
    note: "Set APPLYSHARP_APPLICATION_STORE=prisma with DATABASE_URL to use PostgreSQL persistence. Local JSON remains the first-user fallback."
  });
}

export async function POST(request: Request) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const parsed = createApplicationSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid application payload",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const result = await createApplication({
    status: parsed.data.status,
    job: parsed.data.job as JobListing,
    fit: parsed.data.fit as FitResult,
    resumeMarkdown: parsed.data.resumeMarkdown,
    pdfFileName: parsed.data.pdfFileName,
    coverLetter: parsed.data.coverLetter,
    emailSubject: parsed.data.emailSubject,
    emailBody: parsed.data.emailBody,
    note: parsed.data.note
  }, userScope);

  return NextResponse.json({ application: result.data, storage: result.storage, warning: result.warning, userScope: userScope.source }, { status: 201 });
}
