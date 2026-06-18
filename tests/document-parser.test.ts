import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { parseResumeDocument } from "../lib/document-parser";

test("extracts resume text from plain text uploads", () => {
  const parsed = parseResumeDocument({
    fileName: "resume.txt",
    fileType: "text/plain",
    buffer: Buffer.from("SQL Power BI dashboard reporting", "utf8")
  });

  assert.equal(parsed.format, "text");
  assert.match(parsed.text, /Power BI/);
});

test("extracts resume text from DOCX document XML", () => {
  const parsed = parseResumeDocument({
    fileName: "resume.docx",
    fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: createDocxBuffer("SQL Power BI dashboard reporting")
  });

  assert.equal(parsed.format, "docx");
  assert.match(parsed.text, /SQL Power BI dashboard reporting/);
});

test("extracts resume text from a text-based PDF stream", () => {
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Length 36 >>\nstream\nBT (SQL Power BI dashboard) Tj ET\nendstream\nendobj\n%%EOF",
    "latin1"
  );
  const parsed = parseResumeDocument({
    fileName: "resume.pdf",
    fileType: "application/pdf",
    buffer: pdf
  });

  assert.equal(parsed.format, "pdf");
  assert.match(parsed.text, /SQL Power BI dashboard/);
  assert.ok(parsed.warnings.some((warning) => warning.includes("best-effort")));
});

test("rejects unsupported resume file types", () => {
  assert.throws(
    () =>
      parseResumeDocument({
        fileName: "resume.png",
        fileType: "image/png",
        buffer: Buffer.from("not a resume")
      }),
    /Unsupported resume file type/
  );
});

function createDocxBuffer(text: string): Buffer {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`;
  const fileName = Buffer.from("word/document.xml", "utf8");
  const data = Buffer.from(xml, "utf8");
  const compressed = deflateRawSync(data);
  const localHeader = Buffer.alloc(30);

  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt32LE(0, 10);
  localHeader.writeUInt32LE(0, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(fileName.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const localFile = Buffer.concat([localHeader, fileName, compressed]);
  const centralDirectory = Buffer.alloc(46);
  centralDirectory.writeUInt32LE(0x02014b50, 0);
  centralDirectory.writeUInt16LE(20, 4);
  centralDirectory.writeUInt16LE(20, 6);
  centralDirectory.writeUInt16LE(0, 8);
  centralDirectory.writeUInt16LE(8, 10);
  centralDirectory.writeUInt32LE(0, 12);
  centralDirectory.writeUInt32LE(0, 16);
  centralDirectory.writeUInt32LE(compressed.length, 20);
  centralDirectory.writeUInt32LE(data.length, 24);
  centralDirectory.writeUInt16LE(fileName.length, 28);
  centralDirectory.writeUInt16LE(0, 30);
  centralDirectory.writeUInt16LE(0, 32);
  centralDirectory.writeUInt16LE(0, 34);
  centralDirectory.writeUInt16LE(0, 36);
  centralDirectory.writeUInt32LE(0, 38);
  centralDirectory.writeUInt32LE(0, 42);

  const centralFile = Buffer.concat([centralDirectory, fileName]);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(centralFile.length, 12);
  endOfCentralDirectory.writeUInt32LE(localFile.length, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([localFile, centralFile, endOfCentralDirectory]);
}
