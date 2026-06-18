import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeJobAgainstResume, parseResumeProfile, type JobListing } from "../lib/applysharp";
import { deleteApplicationRecord, listApplicationRecords, saveApplicationRecord, summarizeApplicationRecords, updateApplicationRecordStatus } from "../lib/application-store";

const resumeText = "Built Power BI dashboards with SQL, Grafana monitoring, and Python reporting automation.";

const job: JobListing = {
  id: "job_application_store",
  title: "Power BI Analyst",
  company: "Selangor Analytics",
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
  requirements: ["SQL", "Power BI", "dashboard"],
  responsibilities: ["Build dashboards"],
  atsKeywords: ["SQL", "Power BI", "dashboard reporting"],
  postedAgeDays: 1
};

test("saves full application snapshots and lists newest first", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "applysharp-applications-"));
  const storePath = path.join(directory, "applications.json");

  try {
    const fit = analyzeJobAgainstResume(parseResumeProfile(resumeText), job);
    const saved = await saveApplicationRecord(
      {
        status: "tailored",
        job,
        fit,
        resumeMarkdown: "# Candidate\n\n## Core Skills\n\n- SQL\n- Power BI",
        pdfFileName: "selangor-analytics-power-bi-analyst.pdf",
        coverLetter: "Dear Hiring Team...",
        emailSubject: "Application for Power BI Analyst",
        emailBody: "Hi Hiring Team...",
        note: "Tailored resume generated."
      },
      storePath
    );
    const applications = await listApplicationRecords(storePath);

    assert.equal(applications.length, 1);
    assert.equal(applications[0].id, saved.id);
    assert.equal(applications[0].job.company, "Selangor Analytics");
    assert.equal(applications[0].resumeVersion.pdfFileName, "selangor-analytics-power-bi-analyst.pdf");
    assert.equal(applications[0].coverLetter.emailSubject, "Application for Power BI Analyst");
    assert.equal(applications[0].score, fit.fitScore);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("updates application status and appends status history", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "applysharp-applications-"));
  const storePath = path.join(directory, "applications.json");

  try {
    const fit = analyzeJobAgainstResume(parseResumeProfile(resumeText), job);
    const saved = await saveApplicationRecord({ status: "saved", job, fit }, storePath);
    const updated = await updateApplicationRecordStatus(saved.id, "applied", "Opened apply link.", storePath);

    assert.equal(updated.status, "applied");
    assert.equal(updated.statusHistory[0].status, "applied");
    assert.equal(updated.statusHistory[0].note, "Opened apply link.");
    assert.equal(updated.statusHistory[1].status, "saved");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("deletes application records and their embedded resume assets", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "applysharp-applications-"));
  const storePath = path.join(directory, "applications.json");

  try {
    const fit = analyzeJobAgainstResume(parseResumeProfile(resumeText), job);
    const saved = await saveApplicationRecord(
      {
        status: "tailored",
        job,
        fit,
        resumeMarkdown: "# Candidate\n\n## Core Skills\n\n- SQL",
        coverLetter: "Dear Hiring Team",
        emailBody: "Hi Hiring Team"
      },
      storePath
    );
    const deleted = await deleteApplicationRecord(saved.id, storePath);
    const applications = await listApplicationRecords(storePath);

    assert.equal(deleted.id, saved.id);
    assert.equal(deleted.resumeVersion.markdown?.includes("Core Skills"), true);
    assert.equal(applications.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("summarizes application records by status and source", async () => {
  const fit = analyzeJobAgainstResume(parseResumeProfile(resumeText), job);
  const first = { ...job, id: "job_summary_1", sourcePlatform: "JobStreet" as const };
  const second = { ...job, id: "job_summary_2", sourcePlatform: "LinkedIn" as const, applyLink: "https://linkedin.com/jobs/example" };
  const records = [
    saveRecordForSummary("downloaded", first, fit),
    saveRecordForSummary("applied", second, { ...fit, fitScore: 70 })
  ];
  const summary = summarizeApplicationRecords(records);

  assert.equal(summary.total, 2);
  assert.equal(summary.averageScore, Math.round((fit.fitScore + 70) / 2));
  assert.equal(summary.byStatus.downloaded, 1);
  assert.equal(summary.byStatus.applied, 1);
  assert.equal(summary.bySource.JobStreet, 1);
  assert.equal(summary.bySource.LinkedIn, 1);
  assert.equal(summary.highIntent, 2);
  assert.equal(summary.needsFollowUp, 1);
});

function saveRecordForSummary(status: "downloaded" | "applied", jobListing: JobListing, fit: ReturnType<typeof analyzeJobAgainstResume>) {
  const timestamp = "2026-06-05T08:00:00.000Z";

  return {
    id: `${jobListing.id}-${status}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    status,
    job: jobListing,
    fit,
    score: fit.fitScore,
    applyLink: jobListing.applyLink,
    sourcePlatform: jobListing.sourcePlatform,
    resumeVersion: { pdfFileName: `${jobListing.id}.pdf` },
    coverLetter: {},
    statusHistory: [{ status, at: timestamp }]
  };
}
