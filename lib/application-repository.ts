import type { Application as PrismaApplication, ApplicationEvent, CoverLetter, JobAnalysis, JobListing as PrismaJobListing, TailoredResume } from "@prisma/client";
import { type ApplySharpUserScope, getDemoUserScope } from "./auth-context";
import { scoreLocation, type ApplicationStatus, type CompanyType, type FitResult, type JobCategory, type JobListing, type WorkMode } from "./applysharp";
import {
  type ApplicationRecord,
  type ApplicationSnapshotInput,
  deleteApplicationRecord,
  listApplicationRecords,
  saveApplicationRecord,
  updateApplicationRecordStatus
} from "./application-store";
import { prisma } from "./prisma";

export type ApplicationRepositoryMode = "local-json" | "prisma" | "prisma-fallback-local-json";

export type ApplicationRepositoryResult<T> = {
  data: T;
  storage: ApplicationRepositoryMode;
  warning?: string;
};

type PrismaApplicationWithRelations = PrismaApplication & {
  jobListing: PrismaJobListing & {
    analyses: JobAnalysis[];
  };
  tailoredResume: TailoredResume | null;
  coverLetter: CoverLetter | null;
  events: ApplicationEvent[];
};

export function shouldUsePrismaApplicationStore(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.APPLYSHARP_APPLICATION_STORE === "prisma";
}

export async function listApplications(userScope?: ApplySharpUserScope): Promise<ApplicationRepositoryResult<ApplicationRecord[]>> {
  if (!shouldUsePrismaApplicationStore()) {
    return { data: await listApplicationRecords(), storage: "local-json" };
  }

  try {
    const user = await getOrCreatePrismaUser(userScope);
    const applications = await prisma.application.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        jobListing: { include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } } },
        tailoredResume: true,
        coverLetter: true,
        events: { orderBy: { createdAt: "desc" } }
      }
    });

    return {
      data: applications.map(mapPrismaApplicationToRecord),
      storage: "prisma"
    };
  } catch (error) {
    return {
      data: await listApplicationRecords(),
      storage: "prisma-fallback-local-json",
      warning: error instanceof Error ? error.message : "Prisma application list failed."
    };
  }
}

export async function createApplication(input: ApplicationSnapshotInput, userScope?: ApplySharpUserScope): Promise<ApplicationRepositoryResult<ApplicationRecord>> {
  if (!shouldUsePrismaApplicationStore()) {
    return { data: await saveApplicationRecord(input), storage: "local-json" };
  }

  try {
    const record = await createPrismaApplication(input, userScope);

    return {
      data: record,
      storage: "prisma"
    };
  } catch (error) {
    return {
      data: await saveApplicationRecord(input),
      storage: "prisma-fallback-local-json",
      warning: error instanceof Error ? error.message : "Prisma application save failed."
    };
  }
}

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
  note?: string,
  userScope?: ApplySharpUserScope
): Promise<ApplicationRepositoryResult<ApplicationRecord>> {
  if (!shouldUsePrismaApplicationStore()) {
    return { data: await updateApplicationRecordStatus(id, status, note), storage: "local-json" };
  }

  try {
    const user = await getOrCreatePrismaUser(userScope);
    const existing = await prisma.application.findFirst({
      where: { id, userId: user.id },
      select: { id: true }
    });

    if (!existing) {
      throw new Error("Application record not found.");
    }

    const application = await prisma.application.update({
      where: { id: existing.id },
      data: {
        status: toPrismaApplicationStatus(status),
        appliedAt: status === "applied" ? new Date() : undefined,
        events: {
          create: {
            status: toPrismaApplicationStatus(status),
            note
          }
        }
      },
      include: {
        jobListing: { include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } } },
        tailoredResume: true,
        coverLetter: true,
        events: { orderBy: { createdAt: "desc" } }
      }
    });

    return {
      data: mapPrismaApplicationToRecord(application),
      storage: "prisma"
    };
  } catch (error) {
    return {
      data: await updateApplicationRecordStatus(id, status, note),
      storage: "prisma-fallback-local-json",
      warning: error instanceof Error ? error.message : "Prisma application status update failed."
    };
  }
}

export async function deleteApplication(id: string, userScope?: ApplySharpUserScope): Promise<ApplicationRepositoryResult<ApplicationRecord>> {
  if (!shouldUsePrismaApplicationStore()) {
    return { data: await deleteApplicationRecord(id), storage: "local-json" };
  }

  try {
    return {
      data: await deletePrismaApplication(id, userScope),
      storage: "prisma"
    };
  } catch (error) {
    return {
      data: await deleteApplicationRecord(id),
      storage: "prisma-fallback-local-json",
      warning: error instanceof Error ? error.message : "Prisma application delete failed."
    };
  }
}

async function createPrismaApplication(input: ApplicationSnapshotInput, userScope?: ApplySharpUserScope): Promise<ApplicationRecord> {
  const user = await getOrCreatePrismaUser(userScope);
  const jobListing = await prisma.jobListing.create({
    data: {
      userId: user.id,
      title: input.job.title,
      company: input.job.company,
      companyType: toPrismaCompanyType(input.job.companyType),
      category: toPrismaJobCategory(input.job.category),
      location: input.job.location,
      distanceKmFromBukitJelutong: input.job.distanceKmFromBukitJelutong,
      estimatedCommuteMinutes: input.job.estimatedCommuteMinutes,
      mapLink: input.job.mapLink,
      salary: input.job.salary,
      workMode: toPrismaWorkMode(input.job.workMode),
      experienceLevel: toPrismaExperienceLevel(input.job.experienceLevel),
      sourcePlatform: toPrismaSourcePlatform(input.job.sourcePlatform),
      sourceUrl: input.job.source,
      officialApplyLink: input.job.applyLink,
      externalApplyLink: input.job.applyLink,
      hrEmail: input.job.hrEmail,
      requirements: input.job.requirements,
      responsibilities: input.job.responsibilities,
      atsKeywords: input.job.atsKeywords,
      rawDescription: [input.job.title, input.job.requirements.join("\n"), input.job.responsibilities.join("\n")].join("\n"),
      postedAt: new Date(Date.now() - input.job.postedAgeDays * 24 * 60 * 60 * 1000)
    }
  });
  const analysis = await prisma.jobAnalysis.create({
    data: {
      jobListingId: jobListing.id,
      userId: user.id,
      fitScore: input.fit.fitScore,
      atsScore: input.fit.atsScore,
      missingKeywords: input.fit.missingKeywords,
      matchedKeywords: input.fit.matchedKeywords,
      skillGaps: input.fit.skillGaps,
      recruiterConcerns: input.fit.recruiterConcerns,
      improvements: input.fit.improvements,
      promptWarnings: [],
      provider: "applysharp",
      model: "application-save"
    }
  });
  const masterResume = input.resumeMarkdown
    ? await prisma.masterResume.create({
        data: {
          userId: user.id,
          title: "Application snapshot master resume",
          rawText: "Application save snapshot. Replace with the authenticated user's active master resume in production."
        }
      })
    : null;
  const tailoredResume =
    input.resumeMarkdown && masterResume
      ? await prisma.tailoredResume.create({
          data: {
            userId: user.id,
            masterResumeId: masterResume.id,
            jobAnalysisId: analysis.id,
            title: `${input.job.company} - ${input.job.title}`,
            markdown: input.resumeMarkdown,
            pdfUrl: input.pdfFileName,
            truthMap: {},
            unsupportedClaims: [],
            status: input.status === "downloaded" ? "DOWNLOADED" : "READY"
          }
        })
      : null;
  const coverLetter =
    input.coverLetter || input.emailSubject || input.emailBody
      ? await prisma.coverLetter.create({
          data: {
            userId: user.id,
            jobAnalysisId: analysis.id,
            title: `${input.job.company} - ${input.job.title} Cover Letter`,
            body: input.coverLetter || "",
            emailSubject: input.emailSubject || `Application for ${input.job.title}`,
            emailBody: input.emailBody || ""
          }
        })
      : null;
  const application = await prisma.application.create({
    data: {
      userId: user.id,
      jobListingId: jobListing.id,
      tailoredResumeId: tailoredResume?.id,
      coverLetterId: coverLetter?.id,
      status: toPrismaApplicationStatus(input.status),
      applyMethod: input.job.hrEmail ? "email_or_link" : "apply_link",
      applyUrl: input.job.applyLink,
      hrEmail: input.job.hrEmail,
      confirmationNote: input.note,
      appliedAt: input.status === "applied" ? new Date() : undefined,
      events: {
        create: {
          status: toPrismaApplicationStatus(input.status),
          note: input.note
        }
      }
    },
    include: {
      jobListing: { include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } } },
      tailoredResume: true,
      coverLetter: true,
      events: { orderBy: { createdAt: "desc" } }
    }
  });

  return mapPrismaApplicationToRecord(application);
}

async function deletePrismaApplication(id: string, userScope?: ApplySharpUserScope): Promise<ApplicationRecord> {
  const user = await getOrCreatePrismaUser(userScope);

  return prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({
      where: { id },
      include: {
        jobListing: { include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } } },
        tailoredResume: true,
        coverLetter: true,
        events: { orderBy: { createdAt: "desc" } }
      }
    });

    if (!application || application.userId !== user.id) {
      throw new Error("Application record not found.");
    }

    const record = mapPrismaApplicationToRecord(application);
    const generatedMasterResumeId = application.tailoredResume?.masterResumeId;

    await tx.application.delete({ where: { id } });

    if (application.tailoredResumeId) {
      await tx.tailoredResume.delete({ where: { id: application.tailoredResumeId } }).catch(() => undefined);
    }
    if (application.coverLetterId) {
      await tx.coverLetter.delete({ where: { id: application.coverLetterId } }).catch(() => undefined);
    }

    const remainingApplications = await tx.application.count({ where: { jobListingId: application.jobListingId } });
    if (remainingApplications === 0) {
      await tx.jobListing.delete({ where: { id: application.jobListingId } }).catch(() => undefined);
    }
    if (generatedMasterResumeId) {
      await tx.masterResume.delete({ where: { id: generatedMasterResumeId } }).catch(() => undefined);
    }

    return record;
  });
}

async function getOrCreatePrismaUser(userScope?: ApplySharpUserScope) {
  const scope = userScope ?? getDemoUserScope();

  return prisma.user.upsert({
    where: { email: scope.email },
    update: scope.name ? { name: scope.name } : {},
    create: {
      email: scope.email,
      name: scope.name
    }
  });
}

export function mapPrismaApplicationToRecord(application: PrismaApplicationWithRelations): ApplicationRecord {
  const analysis = application.jobListing.analyses[0];
  const job = mapPrismaJobToJobListing(application.jobListing);
  const fit: FitResult = {
    fitScore: analysis?.fitScore ?? 0,
    atsScore: analysis?.atsScore ?? 0,
    locationScore: scoreLocation(job),
    decision: (analysis?.fitScore ?? 0) >= 80 ? "Apply" : "Stretch",
    missingKeywords: analysis?.missingKeywords ?? [],
    matchedKeywords: analysis?.matchedKeywords ?? [],
    skillGaps: analysis?.skillGaps ?? [],
    recruiterConcerns: analysis?.recruiterConcerns ?? [],
    improvements: analysis?.improvements ?? []
  };

  return {
    id: application.id,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    status: fromPrismaApplicationStatus(application.status),
    job,
    fit,
    score: fit.fitScore,
    applyLink: application.applyUrl || job.applyLink,
    hrEmail: application.hrEmail || undefined,
    sourcePlatform: job.sourcePlatform,
    resumeVersion: {
      markdown: application.tailoredResume?.markdown,
      pdfFileName: application.tailoredResume?.pdfUrl || undefined
    },
    coverLetter: {
      body: application.coverLetter?.body,
      emailSubject: application.coverLetter?.emailSubject,
      emailBody: application.coverLetter?.emailBody
    },
    statusHistory: application.events.map((event) => ({
      status: fromPrismaApplicationStatus(event.status),
      note: event.note || undefined,
      at: event.createdAt.toISOString()
    }))
  };
}

function mapPrismaJobToJobListing(job: PrismaJobListing): JobListing {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    companyType: fromPrismaCompanyType(job.companyType),
    category: fromPrismaJobCategory(job.category),
    location: job.location,
    distanceKmFromBukitJelutong: job.distanceKmFromBukitJelutong ?? undefined,
    estimatedCommuteMinutes: job.estimatedCommuteMinutes ?? undefined,
    mapLink: job.mapLink ?? undefined,
    salary: job.salary || "Not disclosed",
    source: job.sourceUrl || job.officialApplyLink || "Prisma",
    sourcePlatform: fromPrismaSourcePlatform(job.sourcePlatform),
    workMode: fromPrismaWorkMode(job.workMode),
    experienceLevel: fromPrismaExperienceLevel(job.experienceLevel),
    applyLink: job.officialApplyLink || job.externalApplyLink || "",
    hrEmail: job.hrEmail ?? undefined,
    requirements: job.requirements,
    responsibilities: job.responsibilities,
    atsKeywords: job.atsKeywords,
    postedAgeDays: job.postedAt ? Math.max(0, Math.round((Date.now() - job.postedAt.getTime()) / (24 * 60 * 60 * 1000))) : 3
  };
}

function toPrismaApplicationStatus(status: ApplicationStatus) {
  return status.toUpperCase() as "SAVED" | "TAILORED" | "DOWNLOADED" | "APPLIED" | "INTERVIEW" | "REJECTED" | "OFFER" | "ARCHIVED";
}

function fromPrismaApplicationStatus(status: string): ApplicationStatus {
  return status.toLowerCase() as ApplicationStatus;
}

function toPrismaCompanyType(value: CompanyType) {
  return ({ MNC: "MNC", SME: "SME", Startup: "STARTUP", Agency: "AGENCY", GLC: "GLC", Other: "OTHER" } as const)[value];
}

function fromPrismaCompanyType(value: string): CompanyType {
  return ({ MNC: "MNC", SME: "SME", STARTUP: "Startup", AGENCY: "Agency", GLC: "GLC", OTHER: "Other" } as const)[value as "MNC"] ?? "Other";
}

function toPrismaJobCategory(value: JobCategory) {
  return ({ MNC: "MNC", SME: "SME", "Fresh Graduate": "FRESH_GRADUATE", Remote: "REMOTE", Internship: "INTERNSHIP", Contract: "CONTRACT", Others: "OTHERS" } as const)[value];
}

function fromPrismaJobCategory(value: string): JobCategory {
  const map = { MNC: "MNC", SME: "SME", FRESH_GRADUATE: "Fresh Graduate", REMOTE: "Remote", INTERNSHIP: "Internship", CONTRACT: "Contract", OTHERS: "Others" } as const;
  return map[value as keyof typeof map] ?? "Others";
}

function toPrismaWorkMode(value: WorkMode) {
  return ({ Remote: "REMOTE", Hybrid: "HYBRID", "On-site": "ON_SITE" } as const)[value];
}

function fromPrismaWorkMode(value: string): WorkMode {
  return ({ REMOTE: "Remote", HYBRID: "Hybrid", ON_SITE: "On-site" } as const)[value as "REMOTE"] ?? "Hybrid";
}

function toPrismaExperienceLevel(value: JobListing["experienceLevel"]) {
  return ({ "Fresh Graduate": "FRESH_GRADUATE", Entry: "ENTRY", Junior: "JUNIOR", Mid: "MID", Senior: "SENIOR" } as const)[value];
}

function fromPrismaExperienceLevel(value: string): JobListing["experienceLevel"] {
  const map = { FRESH_GRADUATE: "Fresh Graduate", ENTRY: "Entry", JUNIOR: "Junior", MID: "Mid", SENIOR: "Senior" } as const;
  return map[value as keyof typeof map] ?? "Junior";
}

function toPrismaSourcePlatform(value: JobListing["sourcePlatform"]) {
  return ({ JobStreet: "JOBSTREET", Indeed: "INDEED", LinkedIn: "LINKEDIN", "Company Site": "COMPANY_SITE", "Public Listing": "PUBLIC_LISTING" } as const)[value];
}

function fromPrismaSourcePlatform(value: string): JobListing["sourcePlatform"] {
  const map = { JOBSTREET: "JobStreet", INDEED: "Indeed", LINKEDIN: "LinkedIn", COMPANY_SITE: "Company Site", PUBLIC_LISTING: "Public Listing", OTHER: "Public Listing" } as const;
  return map[value as keyof typeof map] ?? "Public Listing";
}
