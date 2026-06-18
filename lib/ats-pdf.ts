export type AtsPdfOptions = {
  title?: string;
  author?: string;
};

const pageWidth = 612;
const pageHeight = 792;
const marginX = 54;
const marginTop = 54;
const marginBottom = 54;
const fontSize = 10.5;
const headingFontSize = 12.5;
const lineHeight = 15;
const maxLineCharacters = 92;

type PdfLine = {
  text: string;
  heading: boolean;
};

export function markdownToAtsText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/[*_`]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(/^#{1,6}\s*/, "").replace(/^[-*]\s+/, "- "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createAtsResumePdf(markdown: string, options: AtsPdfOptions = {}): Buffer {
  const lines = preparePdfLines(markdown);
  const pages = paginateLines(lines);
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const fontObjectId = 3;

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "";
  objects[fontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  for (const pageLines of pages) {
    const contentObjectId = objects.length;
    const pageObjectId = contentObjectId + 1;
    const stream = buildContentStream(pageLines);

    objects[contentObjectId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    pageObjectIds.push(pageObjectId);
  }

  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  const infoObjectId = objects.length;
  objects[infoObjectId] = [
    "<<",
    `/Title (${escapePdfText(normalizePdfText(options.title ?? "ATS Resume"))})`,
    `/Author (${escapePdfText(normalizePdfText(options.author ?? "ApplySharp"))})`,
    "/Creator (ApplySharp ATS PDF Generator)",
    ">>"
  ].join("\n");

  return assemblePdf(objects, infoObjectId);
}

function preparePdfLines(markdown: string): PdfLine[] {
  const text = markdownToAtsText(markdown);
  const sourceLines = text.split("\n");
  const lines: PdfLine[] = [];

  for (const rawLine of sourceLines) {
    const line = normalizePdfText(rawLine.trim());
    if (!line) {
      lines.push({ text: "", heading: false });
      continue;
    }

    const heading = isHeading(rawLine);
    const wrapped = wrapLine(line, heading ? 72 : maxLineCharacters);
    for (const wrappedLine of wrapped) {
      lines.push({ text: wrappedLine, heading });
    }
  }

  return lines.length ? lines : [{ text: "Resume content unavailable.", heading: false }];
}

function paginateLines(lines: PdfLine[]): PdfLine[][] {
  const pages: PdfLine[][] = [[]];
  let cursorY = pageHeight - marginTop;

  for (const line of lines) {
    const lineAdvance = line.heading ? lineHeight + 2 : lineHeight;
    if (cursorY - lineAdvance < marginBottom) {
      pages.push([]);
      cursorY = pageHeight - marginTop;
    }
    pages[pages.length - 1].push(line);
    cursorY -= lineAdvance;
  }

  return pages;
}

function buildContentStream(lines: PdfLine[]): string {
  const commands: string[] = ["BT", `${marginX} ${pageHeight - marginTop} Td`, `${lineHeight} TL`];

  for (const line of lines) {
    if (!line.text) {
      commands.push("T*");
      continue;
    }

    commands.push(`/F1 ${line.heading ? headingFontSize : fontSize} Tf`);
    commands.push(`(${escapePdfText(line.text)}) Tj`);
    commands.push("T*");
  }

  commands.push("ET");
  return commands.join("\n");
}

function assemblePdf(objects: string[], infoObjectId: number): Buffer {
  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets = [0];

  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(chunks.join(""), "latin1");
    chunks.push(`${id} 0 obj\n${objects[id]}\nendobj\n`);
  }

  const xrefOffset = Buffer.byteLength(chunks.join(""), "latin1");
  chunks.push(`xref\n0 ${objects.length}\n`);
  chunks.push("0000000000 65535 f \n");

  for (let id = 1; id < objects.length; id += 1) {
    chunks.push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }

  chunks.push(
    [
      "trailer",
      `<< /Size ${objects.length} /Root 1 0 R /Info ${infoObjectId} 0 R >>`,
      "startxref",
      String(xrefOffset),
      "%%EOF"
    ].join("\n")
  );

  return Buffer.from(chunks.join(""), "latin1");
}

function isHeading(line: string): boolean {
  return /^#{1,3}\s+/.test(line) || (/^[A-Z][A-Z0-9 /&.-]{2,}$/.test(line.trim()) && !line.trim().startsWith("- "));
}

function wrapLine(line: string, maxCharacters: number): string[] {
  const words = line.split(/\s+/);
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length > maxCharacters) {
      wrapped.push(current);
      current = word;
    } else {
      current += ` ${word}`;
    }
  }

  if (current) {
    wrapped.push(current);
  }

  return wrapped;
}

function normalizePdfText(value: string): string {
  return value
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, "\"")
    .replace(/[^\n\r\t -~]/g, "?");
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
