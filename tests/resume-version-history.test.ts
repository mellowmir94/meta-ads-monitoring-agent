import assert from "node:assert/strict";
import test from "node:test";
import type { ApplicationRecord } from "../lib/application-store";
import { buildResumeVersionHistory, summarizeResumeVersionHistory } from "../lib/resume-version-history";

const baseApplication: ApplicationRecord = {
  id: "app_1",
  createdAt: "2026-06-05T08:00:00.000Z",
  updatedAt: "2026-06-05T09:00:00.000Z",
  status: "tailored",
  job: {
    id: "job_1",
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
  },
  fit: {
    fitScore: 88,
    atsScore: 90,
    locationScore: 90,
    decision: "Apply",
    missingKeywords: [],
    matchedKeywords: ["SQL", "Power BI"],
    skillGaps: [],
    recruiterConcerns: [],
    improvements: []
  },
  score: 88,
  applyLink: "https://example.com/apply",
  hrEmail: "hr@example.com",
  sourcePlatform: "JobStreet",
  resumeVersion: {
    markdown: "# Candidate\n\n## Core Skills\n\n- SQL",
    pdfFileName: "power-bi-analyst.pdf"
  },
  coverLetter: {
    body: "Dear Hiring Team",
    emailSubject: "Application for Power BI Analyst",
    emailBody: "Hi Hiring Team"
  },
  statusHistory: [{ status: "tailored", at: "2026-06-05T09:00:00.000Z" }]
};

test("builds resume version history from saved application snapshots", () => {
  const emptyApplication = {
    ...baseApplication,
    id: "app_2",
    resumeVersion: {},
    coverLetter: {},
    score: 60
  };
  const versions = buildResumeVersionHistory([emptyApplication, baseApplication]);
  const summary = summarizeResumeVersionHistory(versions);

  assert.equal(versions.length, 1);
  assert.equal(versions[0].applicationId, "app_1");
  assert.equal(versions[0].jobTitle, "Power BI Analyst");
  assert.equal(versions[0].pdfFileName, "power-bi-analyst.pdf");
  assert.equal(versions[0].markdownCharacters, baseApplication.resumeVersion.markdown!.length);
  assert.equal(versions[0].coverLetterSaved, true);
  assert.equal(versions[0].emailDraftSaved, true);
  assert.equal(summary.total, 1);
  assert.equal(summary.withPdf, 1);
  assert.equal(summary.withCoverLetter, 1);
  assert.equal(summary.averageScore, 88);
});
