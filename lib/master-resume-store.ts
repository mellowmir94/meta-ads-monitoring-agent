import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseResumeProfile, type ResumeProfile } from "./applysharp";

export type MasterResumeSource = "paste" | "upload" | "import";

export type MasterResumeSnapshotInput = {
  title?: string;
  rawText: string;
  source?: MasterResumeSource;
  originalFileName?: string;
  fileType?: string;
  sizeBytes?: number;
};

export type MasterResumeRecord = {
  id: string;
  title: string;
  rawText: string;
  profile: ResumeProfile;
  active: boolean;
  source: MasterResumeSource;
  originalFileName?: string;
  fileType?: string;
  sizeBytes?: number;
  createdAt: string;
  updatedAt: string;
};

export type MasterResumeStore = {
  resumes: MasterResumeRecord[];
};

export type MasterResumeSummary = {
  total: number;
  activeId?: string;
  activeTitle?: string;
  activeUpdatedAt?: string;
  activeKeywordCount: number;
};

export const masterResumeStoreVersion = 1;

export function getMasterResumeStorePath(): string {
  return path.join(process.cwd(), ".applysharp-data", "master-resumes.json");
}

export function createMasterResumeRecord(input: MasterResumeSnapshotInput, now = new Date()): MasterResumeRecord {
  const timestamp = now.toISOString();
  const title = input.title?.trim() || "Active Master Resume";

  return {
    id: `${slugify(title)}-${now.getTime()}`,
    title,
    rawText: input.rawText,
    profile: parseResumeProfile(input.rawText),
    active: true,
    source: input.source ?? "paste",
    originalFileName: input.originalFileName,
    fileType: input.fileType,
    sizeBytes: input.sizeBytes,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export async function getActiveMasterResumeRecord(storePath = getMasterResumeStorePath()): Promise<MasterResumeRecord | null> {
  const resumes = await listMasterResumeRecords(storePath);

  return resumes.find((resume) => resume.active) ?? resumes[0] ?? null;
}

export async function listMasterResumeRecords(storePath = getMasterResumeStorePath()): Promise<MasterResumeRecord[]> {
  const store = await readMasterResumeStore(storePath);

  return store.resumes.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveMasterResumeRecord(input: MasterResumeSnapshotInput, storePath = getMasterResumeStorePath()): Promise<MasterResumeRecord> {
  const store = await readMasterResumeStore(storePath);
  const record = createMasterResumeRecord(input);
  store.resumes = [record, ...store.resumes.map((resume) => ({ ...resume, active: false }))].slice(0, 20);
  await writeMasterResumeStore(store, storePath);

  return record;
}

export async function deleteMasterResumeRecord(id: string, storePath = getMasterResumeStorePath()): Promise<MasterResumeRecord> {
  const store = await readMasterResumeStore(storePath);
  const index = store.resumes.findIndex((resume) => resume.id === id);

  if (index === -1) {
    throw new Error("Master resume record not found.");
  }

  const [record] = store.resumes.splice(index, 1);
  if (record.active && store.resumes[0]) {
    store.resumes[0].active = true;
    store.resumes[0].updatedAt = new Date().toISOString();
  }
  await writeMasterResumeStore(store, storePath);

  return record;
}

export function summarizeMasterResumes(resumes: MasterResumeRecord[]): MasterResumeSummary {
  const active = resumes.find((resume) => resume.active) ?? resumes[0];

  return {
    total: resumes.length,
    activeId: active?.id,
    activeTitle: active?.title,
    activeUpdatedAt: active?.updatedAt,
    activeKeywordCount: active?.profile.keywords.length ?? 0
  };
}

async function readMasterResumeStore(storePath: string): Promise<MasterResumeStore> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<MasterResumeStore>;

    return {
      resumes: Array.isArray(parsed.resumes) ? parsed.resumes : []
    };
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") {
      return { resumes: [] };
    }
    throw error;
  }
}

async function writeMasterResumeStore(store: MasterResumeStore, storePath: string): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(
    storePath,
    JSON.stringify(
      {
        version: masterResumeStoreVersion,
        resumes: store.resumes
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
