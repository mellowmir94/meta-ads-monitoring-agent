import { inflateRawSync, inflateSync } from "node:zlib";

const maxResumeBytes = 8 * 1024 * 1024;
const maxExtractedCharacters = 120_000;

export type ResumeDocumentFormat = "text" | "docx" | "pdf";

export type ResumeDocumentParseResult = {
  text: string;
  format: ResumeDocumentFormat;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  warnings: string[];
};

type ParseInput = {
  fileName: string;
  fileType?: string;
  buffer: Buffer | Uint8Array;
  maxBytes?: number;
};

type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
};

export function parseResumeDocument(input: ParseInput): ResumeDocumentParseResult {
  const buffer = Buffer.from(input.buffer);
  const fileName = input.fileName || "resume";
  const fileType = input.fileType || "application/octet-stream";
  const warnings: string[] = [];
  const maxBytes = input.maxBytes ?? maxResumeBytes;

  if (buffer.length === 0) {
    throw new Error("Uploaded resume file is empty.");
  }
  if (buffer.length > maxBytes) {
    throw new Error(`Resume file is too large. Maximum supported size is ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  }

  const lowerName = fileName.toLowerCase();
  let format: ResumeDocumentFormat;
  let text: string;

  if (lowerName.endsWith(".txt") || lowerName.endsWith(".md") || fileType.startsWith("text/")) {
    format = "text";
    text = buffer.toString("utf8");
  } else if (lowerName.endsWith(".docx") || fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    format = "docx";
    text = extractDocxText(buffer);
  } else if (lowerName.endsWith(".pdf") || fileType === "application/pdf") {
    format = "pdf";
    text = extractPdfText(buffer);
    warnings.push("PDF extraction is best-effort for text-based PDFs. Scanned/image-only PDFs need OCR integration.");
  } else {
    throw new Error("Unsupported resume file type. Upload TXT, MD, DOCX, or text-based PDF.");
  }

  const normalizedText = normalizeExtractedText(text);
  if (normalizedText.length < 30) {
    warnings.push("Very little text was extracted. Paste the resume text manually if parsing looks incomplete.");
  }

  return {
    text: normalizedText.slice(0, maxExtractedCharacters),
    format,
    fileName,
    fileType,
    sizeBytes: buffer.length,
    warnings
  };
}

function extractDocxText(buffer: Buffer): string {
  const entries = readZipEntries(buffer);
  const documentEntry = entries.find((entry) => entry.name === "word/document.xml");

  if (!documentEntry) {
    throw new Error("DOCX file does not contain word/document.xml.");
  }

  const xml = extractZipEntry(buffer, documentEntry).toString("utf8");

  return decodeXmlText(
    xml
      .replace(/<w:tab\s*\/>/g, "\t")
      .replace(/<w:br\s*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
  );
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid DOCX ZIP central directory.");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    entries.push({ name, compressionMethod, compressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimumOffset = Math.max(0, buffer.length - 65_557);

  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error("Invalid DOCX ZIP structure.");
}

function extractZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`Invalid ZIP local header for ${entry.name}.`);
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressed;
  }
  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressed);
  }

  throw new Error(`Unsupported DOCX compression method: ${entry.compressionMethod}.`);
}

function extractPdfText(buffer: Buffer): string {
  const source = buffer.toString("latin1");
  if (!source.startsWith("%PDF")) {
    throw new Error("Invalid PDF file signature.");
  }

  const parts: string[] = [];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(source)) !== null) {
    const dictionary = match[1];
    const streamBuffer = Buffer.from(match[2], "latin1");
    const decoded = dictionary.includes("/FlateDecode") ? inflatePdfStream(streamBuffer) : streamBuffer;
    parts.push(extractPdfContentText(decoded.toString("latin1")));
  }

  if (parts.join(" ").trim()) {
    return parts.join("\n");
  }

  return extractPdfContentText(source);
}

function inflatePdfStream(buffer: Buffer): Buffer {
  try {
    return inflateSync(buffer);
  } catch {
    return inflateRawSync(buffer);
  }
}

function extractPdfContentText(content: string): string {
  const parts: string[] = [];
  const literalPattern = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  const arrayPattern = /\[([\s\S]*?)\]\s*TJ/g;
  const hexPattern = /<([0-9a-fA-F\s]+)>\s*Tj/g;
  let match: RegExpExecArray | null;

  while ((match = literalPattern.exec(content)) !== null) {
    parts.push(decodePdfLiteral(match[0].replace(/\s*Tj$/, "")));
  }
  while ((match = arrayPattern.exec(content)) !== null) {
    const literals = match[1].match(/\((?:\\.|[^\\)])*\)/g) ?? [];
    parts.push(literals.map(decodePdfLiteral).join(""));
  }
  while ((match = hexPattern.exec(content)) !== null) {
    parts.push(decodePdfHex(match[1]));
  }

  return parts.join("\n");
}

function decodePdfLiteral(value: string): string {
  const literal = value.replace(/^\(/, "").replace(/\)$/, "");
  let output = "";

  for (let index = 0; index < literal.length; index += 1) {
    const char = literal[index];
    if (char !== "\\") {
      output += char;
      continue;
    }

    const next = literal[index + 1];
    if (!next) {
      continue;
    }

    if (next === "n") output += "\n";
    else if (next === "r") output += "\r";
    else if (next === "t") output += "\t";
    else if (next === "b") output += "\b";
    else if (next === "f") output += "\f";
    else if (next === "(" || next === ")" || next === "\\") output += next;
    else if (/[0-7]/.test(next)) {
      const octal = literal.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] ?? next;
      output += String.fromCharCode(parseInt(octal, 8));
      index += octal.length - 1;
    } else {
      output += next;
    }

    index += 1;
  }

  return output;
}

function decodePdfHex(value: string): string {
  const hex = value.replace(/\s+/g, "");
  const bytes = Buffer.from(hex.length % 2 === 0 ? hex : `${hex}0`, "hex");

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const chars: string[] = [];
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      chars.push(String.fromCharCode(bytes.readUInt16BE(index)));
    }
    return chars.join("");
  }

  return bytes.toString("latin1");
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/[^\S\r\n]+/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}
