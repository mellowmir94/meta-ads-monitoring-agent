import { createAtsResumePdf, markdownToAtsText } from "@/lib/ats-pdf";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  resumeMarkdown: z.string().min(30).max(120_000),
  fileName: z.string().max(160).optional().default("tailored-resume.pdf"),
  title: z.string().max(160).optional().default("Tailored ATS Resume")
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid PDF payload",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const pdf = createAtsResumePdf(parsed.data.resumeMarkdown, {
    title: parsed.data.title,
    author: "ApplySharp"
  });
  const fileName = sanitizePdfFileName(parsed.data.fileName);
  const body = new ArrayBuffer(pdf.length);
  new Uint8Array(body).set(pdf);

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(pdf.length),
      "X-ATS-Text-Characters": String(markdownToAtsText(parsed.data.resumeMarkdown).length)
    }
  });
}

function sanitizePdfFileName(value: string): string {
  const safe = value
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return safe.endsWith(".pdf") ? safe : `${safe || "tailored-resume"}.pdf`;
}
