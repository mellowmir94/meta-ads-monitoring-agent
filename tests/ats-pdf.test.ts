import assert from "node:assert/strict";
import test from "node:test";
import { createAtsResumePdf, markdownToAtsText } from "../lib/ats-pdf";

test("converts markdown resume content into ATS-readable plain text", () => {
  const text = markdownToAtsText(`# Candidate

## Core Skills

- SQL
- Power BI
- [Portfolio](https://example.com)`);

  assert.match(text, /Candidate/);
  assert.match(text, /Core Skills/);
  assert.match(text, /- SQL/);
  assert.match(text, /Portfolio \(https:\/\/example.com\)/);
});

test("creates a valid plain-text ATS PDF buffer", () => {
  const pdf = createAtsResumePdf(`# Candidate

## Professional Summary

Power BI Analyst with SQL dashboard reporting experience.`, {
    title: "Power BI Analyst Resume"
  });
  const pdfText = pdf.toString("latin1");

  assert.ok(pdf.length > 500);
  assert.equal(pdfText.startsWith("%PDF-1.4"), true);
  assert.match(pdfText, /\/BaseFont \/Helvetica/);
  assert.match(pdfText, /Power BI Analyst with SQL dashboard reporting experience/);
  assert.match(pdfText, /%%EOF$/);
});
