import { parseResumeProfile } from "@/lib/applysharp";
import { parseResumeDocument } from "@/lib/document-parser";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!isUploadedFile(file)) {
    return NextResponse.json({ error: "Upload a resume file in the `file` field." }, { status: 400 });
  }

  try {
    const parsed = parseResumeDocument({
      fileName: file.name,
      fileType: file.type,
      buffer: Buffer.from(await file.arrayBuffer())
    });

    return NextResponse.json({
      resumeText: parsed.text,
      profile: parseResumeProfile(parsed.text),
      file: {
        name: parsed.fileName,
        type: parsed.fileType,
        sizeBytes: parsed.sizeBytes,
        format: parsed.format
      },
      warnings: [
        ...parsed.warnings,
        "Uploaded resume text is parsed in memory for this MVP. Persistent encrypted file storage is still a production integration."
      ]
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Resume upload parsing failed."
      },
      { status: 400 }
    );
  }
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      typeof value.arrayBuffer === "function" &&
      "name" in value &&
      typeof value.name === "string"
  );
}
