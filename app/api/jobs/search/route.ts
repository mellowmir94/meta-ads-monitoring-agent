import { analyzeJobAgainstResume, parseResumeProfile, searchJobListings } from "@/lib/applysharp";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  resumeText: z.string().max(120_000).optional().default(""),
  role: z.string().max(120).optional(),
  location: z.string().max(120).optional(),
  salary: z.string().max(120).optional(),
  industry: z.string().max(120).optional(),
  category: z.enum(["All", "MNC", "SME", "Fresh Graduate", "Remote", "Internship", "Contract", "Others"]).optional(),
  companyType: z.enum(["All", "MNC", "SME", "Startup", "Agency", "GLC", "Other"]).optional(),
  experienceLevel: z.enum(["All", "Fresh Graduate", "Entry", "Junior", "Mid", "Senior"]).optional(),
  workMode: z.enum(["All", "Remote", "Hybrid", "On-site"]).optional(),
  sourcePlatform: z.enum(["All", "JobStreet", "Indeed", "LinkedIn", "Company Site", "Public Listing"]).optional()
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid search filters",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const jobs = searchJobListings(parsed.data);
  const profile = parsed.data.resumeText ? parseResumeProfile(parsed.data.resumeText) : null;

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      job,
      fit: profile ? analyzeJobAgainstResume(profile, job) : null
    })),
    source: "local-catalog",
    note: "This endpoint is ready for real job-board/company-page connectors; current data is a deterministic safe catalog."
  });
}
