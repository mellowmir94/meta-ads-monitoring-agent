import type { ApplicationRecord } from "./application-store";

export type ResumeVersionHistoryRecord = {
  id: string;
  applicationId: string;
  jobTitle: string;
  company: string;
  sourcePlatform: ApplicationRecord["sourcePlatform"];
  applicationStatus: ApplicationRecord["status"];
  score: number;
  createdAt: string;
  updatedAt: string;
  pdfFileName?: string;
  markdownCharacters: number;
  coverLetterSaved: boolean;
  emailDraftSaved: boolean;
  applyLink: string;
};

export type ResumeVersionHistorySummary = {
  total: number;
  withPdf: number;
  withCoverLetter: number;
  averageScore: number;
};

export function buildResumeVersionHistory(applications: ApplicationRecord[]): ResumeVersionHistoryRecord[] {
  return applications
    .filter((application) => Boolean(application.resumeVersion.markdown || application.resumeVersion.pdfFileName))
    .map((application) => ({
      id: `${application.id}-resume-version`,
      applicationId: application.id,
      jobTitle: application.job.title,
      company: application.job.company,
      sourcePlatform: application.sourcePlatform,
      applicationStatus: application.status,
      score: application.score,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      pdfFileName: application.resumeVersion.pdfFileName,
      markdownCharacters: application.resumeVersion.markdown?.length ?? 0,
      coverLetterSaved: Boolean(application.coverLetter.body),
      emailDraftSaved: Boolean(application.coverLetter.emailBody),
      applyLink: application.applyLink
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function summarizeResumeVersionHistory(versions: ResumeVersionHistoryRecord[]): ResumeVersionHistorySummary {
  const totalScore = versions.reduce((sum, version) => sum + version.score, 0);

  return {
    total: versions.length,
    withPdf: versions.filter((version) => Boolean(version.pdfFileName)).length,
    withCoverLetter: versions.filter((version) => version.coverLetterSaved).length,
    averageScore: versions.length ? Math.round(totalScore / versions.length) : 0
  };
}
