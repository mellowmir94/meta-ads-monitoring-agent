import assert from "node:assert/strict";
import test from "node:test";
import { mapPrismaApplicationToRecord, shouldUsePrismaApplicationStore } from "../lib/application-repository";

test("detects Prisma application store only when explicitly enabled", () => {
  assert.equal(shouldUsePrismaApplicationStore({ APPLYSHARP_APPLICATION_STORE: "prisma" }), true);
  assert.equal(shouldUsePrismaApplicationStore({ DATABASE_URL: "postgresql://example" }), false);
  assert.equal(shouldUsePrismaApplicationStore({ APPLYSHARP_APPLICATION_STORE: "local-json" }), false);
});

test("maps Prisma application records into ApplySharp tracker records", () => {
  const createdAt = new Date("2026-06-05T08:00:00.000Z");
  const updatedAt = new Date("2026-06-05T09:00:00.000Z");
  const record = mapPrismaApplicationToRecord({
    id: "app_1",
    userId: "user_1",
    jobListingId: "job_1",
    tailoredResumeId: "resume_1",
    coverLetterId: "cover_1",
    status: "APPLIED",
    applyMethod: "apply_link",
    applyUrl: "https://example.com/apply",
    hrEmail: "hr@example.com",
    confirmationNote: null,
    appliedAt: updatedAt,
    createdAt,
    updatedAt,
    jobListing: {
      id: "job_1",
      userId: "user_1",
      title: "Power BI Analyst",
      company: "Selangor Data",
      companyType: "SME",
      category: "SME",
      location: "Shah Alam",
      distanceKmFromBukitJelutong: 13,
      estimatedCommuteMinutes: 25,
      mapLink: "https://maps.example",
      salary: "MYR 5,000 - 6,500",
      workMode: "HYBRID",
      experienceLevel: "JUNIOR",
      sourcePlatform: "JOBSTREET",
      sourceUrl: "https://jobstreet.example",
      officialApplyLink: "https://example.com/apply",
      externalApplyLink: null,
      hrEmail: "hr@example.com",
      requirements: ["SQL", "Power BI"],
      responsibilities: ["Build dashboards"],
      atsKeywords: ["SQL", "Power BI"],
      rawDescription: "Power BI Analyst",
      scrapedAt: null,
      postedAt: createdAt,
      createdAt,
      updatedAt,
      analyses: [
        {
          id: "analysis_1",
          jobListingId: "job_1",
          userId: "user_1",
          fitScore: 88,
          atsScore: 82,
          missingKeywords: [],
          matchedKeywords: ["SQL", "Power BI"],
          skillGaps: [],
          recruiterConcerns: [],
          improvements: ["Emphasize dashboards"],
          promptWarnings: [],
          provider: "applysharp",
          model: "application-save",
          createdAt
        }
      ]
    },
    tailoredResume: {
      id: "resume_1",
      userId: "user_1",
      masterResumeId: "master_1",
      jobAnalysisId: "analysis_1",
      title: "Selangor Data - Power BI Analyst",
      markdown: "# Candidate",
      pdfUrl: "power-bi-analyst.pdf",
      truthMap: {},
      unsupportedClaims: [],
      status: "READY",
      createdAt,
      updatedAt
    },
    coverLetter: {
      id: "cover_1",
      userId: "user_1",
      jobAnalysisId: "analysis_1",
      title: "Cover",
      body: "Dear Hiring Team",
      emailSubject: "Application for Power BI Analyst",
      emailBody: "Hi Hiring Team",
      createdAt,
      updatedAt
    },
    events: [
      {
        id: "event_1",
        applicationId: "app_1",
        status: "APPLIED",
        note: "Opened apply link",
        createdAt: updatedAt
      }
    ]
  } as Parameters<typeof mapPrismaApplicationToRecord>[0]);

  assert.equal(record.status, "applied");
  assert.equal(record.job.companyType, "SME");
  assert.equal(record.job.sourcePlatform, "JobStreet");
  assert.equal(record.job.workMode, "Hybrid");
  assert.equal(record.fit.fitScore, 88);
  assert.equal(record.fit.locationScore, 90);
  assert.equal(record.resumeVersion.pdfFileName, "power-bi-analyst.pdf");
  assert.equal(record.coverLetter.emailSubject, "Application for Power BI Analyst");
  assert.equal(record.statusHistory[0].status, "applied");
});
