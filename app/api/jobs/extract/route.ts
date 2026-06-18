import { extractJobListingFromText, htmlToJobText } from "@/lib/job-extractor";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z
  .object({
    jobDescription: z.string().max(120_000).optional().default(""),
    sourceUrl: z.string().url().optional(),
    roleFallback: z.string().max(120).optional(),
    locationFallback: z.string().max(120).optional(),
    resumeText: z.string().max(120_000).optional(),
    fetchUrl: z.boolean().optional().default(false)
  })
  .refine((value) => value.jobDescription.trim().length >= 20 || value.sourceUrl, {
    message: "Provide a pasted JD or source URL.",
    path: ["jobDescription"]
  });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid JD extraction payload",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  try {
    const sourceText =
      parsed.data.jobDescription.trim() ||
      (parsed.data.sourceUrl && parsed.data.fetchUrl ? await fetchJobPageText(parsed.data.sourceUrl) : "");
    const result = extractJobListingFromText({
      jobDescription: sourceText,
      sourceUrl: parsed.data.sourceUrl,
      roleFallback: parsed.data.roleFallback,
      locationFallback: parsed.data.locationFallback,
      resumeText: parsed.data.resumeText
    });

    return NextResponse.json({
      ...result,
      source: parsed.data.sourceUrl ? "url-or-pasted-jd" : "pasted-jd",
      note: "Deterministic extraction is active. OpenAI/Grok extraction can replace or augment this when provider keys are configured."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "JD extraction failed"
      },
      { status: 400 }
    );
  }
}

async function fetchJobPageText(sourceUrl: string): Promise<string> {
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "ApplySharpBot/0.1 (+https://applysharp.local)",
      Accept: "text/html, text/plain;q=0.9"
    },
    signal: AbortSignal.timeout(8_000)
  });

  if (!response.ok) {
    throw new Error(`Could not fetch job URL. HTTP ${response.status}. Paste the JD text manually.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  return contentType.includes("html") ? htmlToJobText(text) : text;
}
