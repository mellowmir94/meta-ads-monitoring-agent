import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applicationStatuses, type ApplicationStatus, type FitResult, type JobListing } from "./applysharp";

export type ApplicationSnapshotInput = {
  status: ApplicationStatus;
  job: JobListing;
  fit: FitResult;
  resumeMarkdown?: string;
  pdfFileName?: string;
  coverLetter?: string;
  emailSubject?: string;
  emailBody?: string;
  note?: string;
};

export type ApplicationRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ApplicationStatus;
  job: JobListing;
  fit: FitResult;
  score: number;
  applyLink: string;
  hrEmail?: string;
  sourcePlatform: JobListing["sourcePlatform"];
  resumeVersion: {
    markdown?: string;
    pdfFileName?: string;
  };
  coverLetter: {
    body?: string;
    emailSubject?: string;
    emailBody?: string;
  };
  statusHistory: Array<{
    status: ApplicationStatus;
    note?: string;
    at: string;
  }>;
};

export type ApplicationStore = {
  applications: ApplicationRecord[];
};

export type ApplicationSummary = {
  total: number;
  averageScore: number;
  byStatus: Record<ApplicationStatus, number>;
  bySource: Partial<Record<JobListing["sourcePlatform"], number>>;
  highIntent: number;
  needsFollowUp: number;
};

export const applicationStoreVersion = 1;

export function getApplicationStorePath(): string {
  return path.join(process.cwd(), ".applysharp-data", "applications.json");
}

export function createApplicationRecord(input: ApplicationSnapshotInput, now = new Date()): ApplicationRecord {
  const timestamp = now.toISOString();
  const id = `${slugify(`${input.job.company}-${input.job.title}`)}-${now.getTime()}`;

  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: input.status,
    job: input.job,
    fit: input.fit,
    score: input.fit.fitScore,
    applyLink: input.job.applyLink,
    hrEmail: input.job.hrEmail,
    sourcePlatform: input.job.sourcePlatform,
    resumeVersion: {
      markdown: input.resumeMarkdown,
      pdfFileName: input.pdfFileName
    },
    coverLetter: {
      body: input.coverLetter,
      emailSubject: input.emailSubject,
      emailBody: input.emailBody
    },
    statusHistory: [
      {
        status: input.status,
        note: input.note,
        at: timestamp
      }
    ]
  };
}

export async function listApplicationRecords(storePath = getApplicationStorePath()): Promise<ApplicationRecord[]> {
  const store = await readApplicationStore(storePath);

  return store.applications.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveApplicationRecord(input: ApplicationSnapshotInput, storePath = getApplicationStorePath()): Promise<ApplicationRecord> {
  const store = await readApplicationStore(storePath);
  const record = createApplicationRecord(input);
  store.applications = [record, ...store.applications];
  await writeApplicationStore(store, storePath);

  return record;
}

export async function updateApplicationRecordStatus(
  id: string,
  status: ApplicationStatus,
  note?: string,
  storePath = getApplicationStorePath()
): Promise<ApplicationRecord> {
  const store = await readApplicationStore(storePath);
  const record = store.applications.find((application) => application.id === id);

  if (!record) {
    throw new Error("Application record not found.");
  }

  const timestamp = new Date().toISOString();
  record.status = status;
  record.updatedAt = timestamp;
  record.statusHistory.unshift({ status, note, at: timestamp });
  await writeApplicationStore(store, storePath);

  return record;
}

export async function deleteApplicationRecord(id: string, storePath = getApplicationStorePath()): Promise<ApplicationRecord> {
  const store = await readApplicationStore(storePath);
  const index = store.applications.findIndex((application) => application.id === id);

  if (index === -1) {
    throw new Error("Application record not found.");
  }

  const [record] = store.applications.splice(index, 1);
  await writeApplicationStore(store, storePath);

  return record;
}

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return applicationStatuses.includes(value as ApplicationStatus);
}

export function summarizeApplicationRecords(applications: ApplicationRecord[]): ApplicationSummary {
  const byStatus = Object.fromEntries(applicationStatuses.map((status) => [status, 0])) as Record<ApplicationStatus, number>;
  const bySource: Partial<Record<JobListing["sourcePlatform"], number>> = {};
  let totalScore = 0;

  for (const application of applications) {
    byStatus[application.status] += 1;
    bySource[application.sourcePlatform] = (bySource[application.sourcePlatform] ?? 0) + 1;
    totalScore += application.score;
  }

  return {
    total: applications.length,
    averageScore: applications.length ? Math.round(totalScore / applications.length) : 0,
    byStatus,
    bySource,
    highIntent: byStatus.tailored + byStatus.downloaded + byStatus.applied + byStatus.interview + byStatus.offer,
    needsFollowUp: byStatus.applied + byStatus.interview
  };
}

async function readApplicationStore(storePath: string): Promise<ApplicationStore> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ApplicationStore>;

    return {
      applications: Array.isArray(parsed.applications) ? parsed.applications : []
    };
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") {
      return { applications: [] };
    }
    throw error;
  }
}

async function writeApplicationStore(store: ApplicationStore, storePath: string): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(
    storePath,
    JSON.stringify(
      {
        version: applicationStoreVersion,
        applications: store.applications
      },
      null,
      2
    ),
    "utf8"
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}
