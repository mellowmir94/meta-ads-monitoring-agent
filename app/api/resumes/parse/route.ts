import { parseResumeProfile } from "@/lib/applysharp";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  resumeText: z.string().min(50).max(120_000)
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid resume payload",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    profile: parseResumeProfile(parsed.data.resumeText),
    warnings: [
      "Parser output is an extraction aid. The user must verify facts before using them in tailored resumes.",
      "Unsupported skills must not be added to resumes."
    ]
  });
}
