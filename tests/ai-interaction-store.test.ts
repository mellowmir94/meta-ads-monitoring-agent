import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AiTailoringResult } from "../lib/ai-tailoring";
import { buildAiTailoringInteractionInput, listAiInteractionRecords, saveAiInteractionRecord, summarizeAiInteractions } from "../lib/ai-interaction-store";
import type { FitResult, JobListing } from "../lib/applysharp";

const resumeText = "PRIVATE RESUME: Built SQL reports and Power BI dashboards for internal operations.";
const jobDescription = "PRIVATE JD: Build dashboards and prepare reporting packs for a confidential team.";

const job: JobListing = {
  id: "ai_log_job",
  title: "Power BI Analyst",
  company: "Selangor Data",
  companyType: "SME",
  category: "SME",
  location: "Shah Alam",
  distanceKmFromBukitJelutong: 13,
  estimatedCommuteMinutes: 25,
  salary: "MYR 5,000 - 6,500",
  source: "JobStreet",
  sourcePlatform: "JobStreet",
  workMode: "Hybrid",
  experienceLevel: "Junior",
  applyLink: "https://example.com/apply",
  requirements: ["SQL", "Power BI"],
  responsibilities: ["Build dashboards"],
  atsKeywords: ["SQL", "Power BI"],
  postedAgeDays: 1
};

const fit: FitResult = {
  fitScore: 88,
  atsScore: 90,
  locationScore: 90,
  decision: "Apply",
  missingKeywords: [],
  matchedKeywords: ["SQL", "Power BI"],
  skillGaps: [],
  recruiterConcerns: [],
  improvements: ["Emphasize dashboards"]
};

const aiTailoring: AiTailoringResult = {
  provider: "openai",
  model: "test-model",
  promptHash: "prompt_hash_123",
  usedFallback: true,
  fallbackReason: "Missing openai API key.",
  warnings: ["Missing openai API key."],
  assets: {
    resumeMarkdown: "# Candidate\n\n## Core Skills\n\n- SQL",
    coverLetter: "Dear Hiring Team",
    emailSubject: "Application for Power BI Analyst",
    emailBody: "Hi Hiring Team",
    truthMap: { SQL: "Master resume" },
    unsupportedClaims: ["Tableau"],
    pdfFileName: "resume.pdf",
    applyActions: [{ label: "Open JobStreet apply link", type: "external", href: "https://example.com/apply", requiresConfirmation: true }]
  }
};

test("builds metadata-only AI interaction input without raw resume or JD text", () => {
  const input = buildAiTailoringInteractionInput({
    intent: "job-analysis-tailoring",
    resumeText,
    job,
    fit,
    aiTailoring,
    jobDescription
  });
  const serialized = JSON.stringify(input);

  assert.equal(input.provider, "openai");
  assert.equal(input.output.usedFallback, true);
  assert.equal(input.output.unsupportedClaimCount, 1);
  assert.match(input.inputSummary, /resumeChars=\d+/);
  assert.match(input.inputSummary, /jdChars=\d+/);
  assert.equal(serialized.includes("PRIVATE RESUME"), false);
  assert.equal(serialized.includes("PRIVATE JD"), false);
});

test("saves, lists, and summarizes AI interaction metadata", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "applysharp-ai-interactions-"));
  const storePath = path.join(directory, "ai-interactions.json");

  try {
    const input = buildAiTailoringInteractionInput({
      intent: "resume-tailoring",
      resumeText,
      job,
      fit,
      aiTailoring
    });
    const saved = await saveAiInteractionRecord(input, storePath);
    const interactions = await listAiInteractionRecords(storePath);
    const summary = summarizeAiInteractions(interactions);

    assert.equal(interactions.length, 1);
    assert.equal(interactions[0].id, saved.id);
    assert.equal(summary.total, 1);
    assert.equal(summary.fallbackCount, 1);
    assert.equal(summary.byProvider.openai, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
