import type { MasterResume as PrismaMasterResume, Prisma, ResumeProfile as PrismaResumeProfile } from "@prisma/client";
import { type ApplySharpUserScope, getDemoUserScope } from "./auth-context";
import type { ResumeProfile } from "./applysharp";
import {
  type MasterResumeRecord,
  type MasterResumeSnapshotInput,
  deleteMasterResumeRecord,
  getActiveMasterResumeRecord,
  listMasterResumeRecords,
  saveMasterResumeRecord
} from "./master-resume-store";
import { parseResumeProfile } from "./applysharp";
import { prisma } from "./prisma";

export type MasterResumeRepositoryMode = "local-json" | "prisma" | "prisma-fallback-local-json";

export type MasterResumeRepositoryResult<T> = {
  data: T;
  storage: MasterResumeRepositoryMode;
  warning?: string;
};

type PrismaMasterResumeWithProfile = PrismaMasterResume & {
  profile: PrismaResumeProfile | null;
};

export function shouldUsePrismaMasterResumeStore(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.APPLYSHARP_MASTER_RESUME_STORE === "prisma";
}

export async function getActiveMasterResume(userScope?: ApplySharpUserScope): Promise<MasterResumeRepositoryResult<MasterResumeRecord | null>> {
  if (!shouldUsePrismaMasterResumeStore()) {
    return { data: await getActiveMasterResumeRecord(), storage: "local-json" };
  }

  try {
    const user = await getOrCreatePrismaUser(userScope);
    const resume = await prisma.masterResume.findFirst({
      where: { userId: user.id, active: true },
      orderBy: { updatedAt: "desc" },
      include: { profile: true }
    });

    return {
      data: resume ? mapPrismaMasterResumeToRecord(resume) : null,
      storage: "prisma"
    };
  } catch (error) {
    return {
      data: await getActiveMasterResumeRecord(),
      storage: "prisma-fallback-local-json",
      warning: error instanceof Error ? error.message : "Prisma master resume load failed."
    };
  }
}

export async function listMasterResumes(userScope?: ApplySharpUserScope): Promise<MasterResumeRepositoryResult<MasterResumeRecord[]>> {
  if (!shouldUsePrismaMasterResumeStore()) {
    return { data: await listMasterResumeRecords(), storage: "local-json" };
  }

  try {
    const user = await getOrCreatePrismaUser(userScope);
    const resumes = await prisma.masterResume.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { profile: true }
    });

    return {
      data: resumes.map(mapPrismaMasterResumeToRecord),
      storage: "prisma"
    };
  } catch (error) {
    return {
      data: await listMasterResumeRecords(),
      storage: "prisma-fallback-local-json",
      warning: error instanceof Error ? error.message : "Prisma master resume list failed."
    };
  }
}

export async function saveMasterResume(input: MasterResumeSnapshotInput, userScope?: ApplySharpUserScope): Promise<MasterResumeRepositoryResult<MasterResumeRecord>> {
  if (!shouldUsePrismaMasterResumeStore()) {
    return { data: await saveMasterResumeRecord(input), storage: "local-json" };
  }

  try {
    return {
      data: await savePrismaMasterResume(input, userScope),
      storage: "prisma"
    };
  } catch (error) {
    return {
      data: await saveMasterResumeRecord(input),
      storage: "prisma-fallback-local-json",
      warning: error instanceof Error ? error.message : "Prisma master resume save failed."
    };
  }
}

export async function deleteMasterResume(id: string, userScope?: ApplySharpUserScope): Promise<MasterResumeRepositoryResult<MasterResumeRecord>> {
  if (!shouldUsePrismaMasterResumeStore()) {
    return { data: await deleteMasterResumeRecord(id), storage: "local-json" };
  }

  try {
    const user = await getOrCreatePrismaUser(userScope);
    const existing = await prisma.masterResume.findFirst({
      where: { id, userId: user.id },
      include: { profile: true }
    });

    if (!existing) {
      throw new Error("Master resume record not found.");
    }

    const resume = await prisma.masterResume.delete({
      where: { id: existing.id },
      include: { profile: true }
    });

    return {
      data: mapPrismaMasterResumeToRecord(resume),
      storage: "prisma"
    };
  } catch (error) {
    return {
      data: await deleteMasterResumeRecord(id),
      storage: "prisma-fallback-local-json",
      warning: error instanceof Error ? error.message : "Prisma master resume delete failed."
    };
  }
}

async function savePrismaMasterResume(input: MasterResumeSnapshotInput, userScope?: ApplySharpUserScope): Promise<MasterResumeRecord> {
  const user = await getOrCreatePrismaUser(userScope);
  const profile = parseResumeProfile(input.rawText);

  await prisma.masterResume.updateMany({
    where: { userId: user.id, active: true },
    data: { active: false }
  });

  const resume = await prisma.masterResume.create({
    data: {
      userId: user.id,
      title: input.title?.trim() || "Active Master Resume",
      originalFileUrl: input.originalFileName,
      rawText: input.rawText,
      active: true,
      profile: {
        create: {
          experience: { summary: profile.summary } as Prisma.InputJsonValue,
          skills: profile.skills,
          education: profile.education as Prisma.InputJsonValue,
          achievements: profile.achievements,
          industries: profile.industries,
          tools: profile.tools,
          keywords: profile.keywords,
          strengths: profile.strengths,
          gaps: profile.gaps,
          parserVersion: "applysharp-v1"
        }
      }
    },
    include: { profile: true }
  });

  return mapPrismaMasterResumeToRecord(resume);
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

export function mapPrismaMasterResumeToRecord(resume: PrismaMasterResumeWithProfile): MasterResumeRecord {
  const profile = mapPrismaResumeProfile(resume.profile, resume.rawText);

  return {
    id: resume.id,
    title: resume.title,
    rawText: resume.rawText,
    profile,
    active: resume.active,
    source: "import",
    originalFileName: resume.originalFileUrl ?? undefined,
    createdAt: resume.createdAt.toISOString(),
    updatedAt: resume.updatedAt.toISOString()
  };
}

function mapPrismaResumeProfile(profile: PrismaResumeProfile | null, rawText: string): ResumeProfile {
  if (!profile) {
    return parseResumeProfile(rawText);
  }

  const experience = profile.experience as { summary?: string } | null;

  return {
    summary: experience?.summary ?? "",
    skills: profile.skills,
    tools: profile.tools,
    industries: profile.industries,
    achievements: profile.achievements,
    education: Array.isArray(profile.education) ? profile.education.filter((item): item is string => typeof item === "string") : [],
    strengths: profile.strengths,
    gaps: profile.gaps,
    keywords: profile.keywords
  };
}
