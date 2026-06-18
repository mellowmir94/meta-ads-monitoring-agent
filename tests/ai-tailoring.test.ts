import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTailoringMessages,
  generateTailoredApplicationAssetsWithAi,
  resolveAiProviderConfig
} from "../lib/ai-tailoring";
import { analyzeJobAgainstResume, parseResumeProfile, type JobListing } from "../lib/applysharp";

const resumeText = `
Data analyst and application support profile.
Built Power BI dashboards, wrote SQL reports, monitored Grafana, and automated reporting with Python.
`;

const job: JobListing = {
  id: "ai_tailor_job",
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
  hrEmail: "hr@example.com",
  requirements: ["SQL", "Power BI", "dashboard"],
  responsibilities: ["Build dashboards"],
  atsKeywords: ["SQL", "Power BI", "dashboard reporting"],
  postedAgeDays: 1
};

const fit = analyzeJobAgainstResume(parseResumeProfile(resumeText), job);

test("resolves configured OpenAI and Grok provider settings", () => {
  assert.equal(resolveAiProviderConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "key" }).provider, "openai");
  assert.equal(resolveAiProviderConfig({ AI_PROVIDER: "grok", GROK_API_KEY: "key" }).provider, "grok");
  assert.equal(resolveAiProviderConfig({ AI_PROVIDER: "unknown" }).provider, "deterministic");
});

test("tailoring prompt contains truth-only guardrails and JSON output contract", () => {
  const messages = buildTailoringMessages(resumeText, job, fit);
  const combined = messages.map((message) => message.content).join("\n");

  assert.match(combined, /Use only facts explicitly supported by the master resume/);
  assert.match(combined, /Never invent skills/);
  assert.match(combined, /Return valid JSON only/);
  assert.match(combined, /unsupportedClaims/);
});

test("falls back deterministically when provider key is missing", async () => {
  const result = await generateTailoredApplicationAssetsWithAi(resumeText, job, fit, {
    provider: "openai",
    model: "test-model"
  });

  assert.equal(result.provider, "openai");
  assert.equal(result.usedFallback, true);
  assert.match(result.fallbackReason ?? "", /Missing openai API key/);
  assert.match(result.assets.resumeMarkdown, /Unsupported JD Keywords To Review/);
});

test("uses valid provider JSON and preserves deterministic filename/apply actions", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                resumeMarkdown: "# Candidate\n\n## Professional Summary\n\nTruthful Power BI analyst.",
                coverLetter: "Dear Hiring Team, truthful fit.",
                emailSubject: "Application for Power BI Analyst",
                emailBody: "Hi Hiring Team, please find my application.",
                truthMap: { "Power BI": "Master resume" },
                unsupportedClaims: ["Tableau"]
              })
            }
          }
        ]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const result = await generateTailoredApplicationAssetsWithAi(resumeText, job, fit, {
    provider: "grok",
    apiKey: "key",
    model: "test-model",
    endpoint: "https://example.com/chat",
    fetchImpl: fakeFetch
  });

  assert.equal(result.provider, "grok");
  assert.equal(result.usedFallback, false);
  assert.match(result.assets.resumeMarkdown, /Truthful Power BI analyst/);
  assert.equal(result.assets.pdfFileName, "selangor-data-power-bi-analyst-tailored-resume.pdf");
  assert.ok(result.assets.applyActions.some((action) => action.label.includes("JobStreet")));
  const emailAction = result.assets.applyActions.find((action) => action.type === "email");
  assert.equal(emailAction ? new URL(emailAction.href).searchParams.get("body") : "", "Hi Hiring Team, please find my application.");
});

test("falls back if provider response is invalid", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 });
  const result = await generateTailoredApplicationAssetsWithAi(resumeText, job, fit, {
    provider: "openai",
    apiKey: "key",
    fetchImpl: fakeFetch
  });

  assert.equal(result.usedFallback, true);
  assert.match(result.assets.resumeMarkdown, /Unsupported JD Keywords To Review/);
});
