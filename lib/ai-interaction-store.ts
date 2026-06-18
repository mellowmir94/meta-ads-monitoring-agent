import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AiTailoringResult } from "./ai-tailoring";
import type { FitResult, JobListing } from "./applysharp";

export type AiInteractionIntent = "job-analysis-tailoring" | "resume-tailoring";

export type AiInteractionOutputSummary = {
  usedFallback: boolean;
  fallbackReason?: string;
  fitScore: number;
  atsScore: number;
  decision: FitResult["decision"];
  assetCharacters: {
    resumeMarkdown: number;
    coverLetter: number;
    emailBody: number;
  };
  unsupportedClaimCount: number;
  applyActionCount: number;
};

export type AiInteractionSnapshotInput = {
  intent: AiInteractionIntent;
  provider: string;
  model: string;
  promptHash: string;
  inputSummary: string;
  output: AiInteractionOutputSummary;
  warnings: string[];
};

export type AiInteractionRecord = AiInteractionSnapshotInput & {
  id: string;
  createdAt: string;
};

export type AiInteractionStore = {
  interactions: AiInteractionRecord[];
};

export type AiInteractionSummary = {
  total: number;
  fallbackCount: number;
  byProvider: Record<string, number>;
  latestAt?: string;
};

export const aiInteractionStoreVersion = 1;

export function getAiInteractionStorePath(): string {
  return path.join(process.cwd(), ".applysharp-data", "ai-interactions.json");
}

export function buildAiTailoringInteractionInput(input: {
  intent: AiInteractionIntent;
  resumeText: string;
  job: JobListing;
  fit: FitResult;
  aiTailoring: AiTailoringResult;
  jobDescription?: string;
}): AiInteractionSnapshotInput {
  const { aiTailoring, fit, job } = input;

  return {
    intent: input.intent,
    provider: aiTailoring.provider,
    model: aiTailoring.model,
    promptHash: aiTailoring.promptHash,
    inputSummary: [
      `job=${job.title} at ${job.company}`,
      `source=${job.sourcePlatform}`,
      `resumeChars=${input.resumeText.length}`,
      `jdChars=${input.jobDescription?.length ?? 0}`,
      `fit=${fit.fitScore}`,
      `ats=${fit.atsScore}`,
      `decision=${fit.decision}`
    ].join("; "),
    output: {
      usedFallback: aiTailoring.usedFallback,
      fallbackReason: aiTailoring.fallbackReason,
      fitScore: fit.fitScore,
      atsScore: fit.atsScore,
      decision: fit.decision,
      assetCharacters: {
        resumeMarkdown: aiTailoring.assets.resumeMarkdown.length,
        coverLetter: aiTailoring.assets.coverLetter.length,
        emailBody: aiTailoring.assets.emailBody.length
      },
      unsupportedClaimCount: aiTailoring.assets.unsupportedClaims.length,
      applyActionCount: aiTailoring.assets.applyActions.length
    },
    warnings: aiTailoring.warnings
  };
}

export function createAiInteractionRecord(input: AiInteractionSnapshotInput, now = new Date()): AiInteractionRecord {
  const timestamp = now.toISOString();

  return {
    ...input,
    id: `${slugify(`${input.intent}-${input.provider}-${input.promptHash}`)}-${now.getTime()}`,
    createdAt: timestamp
  };
}

export async function listAiInteractionRecords(storePath = getAiInteractionStorePath()): Promise<AiInteractionRecord[]> {
  const store = await readAiInteractionStore(storePath);

  return store.interactions.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function saveAiInteractionRecord(input: AiInteractionSnapshotInput, storePath = getAiInteractionStorePath()): Promise<AiInteractionRecord> {
  const store = await readAiInteractionStore(storePath);
  const record = createAiInteractionRecord(input);
  store.interactions = [record, ...store.interactions].slice(0, 500);
  await writeAiInteractionStore(store, storePath);

  return record;
}

export function summarizeAiInteractions(interactions: AiInteractionRecord[]): AiInteractionSummary {
  const byProvider: Record<string, number> = {};
  let fallbackCount = 0;

  for (const interaction of interactions) {
    byProvider[interaction.provider] = (byProvider[interaction.provider] ?? 0) + 1;
    if (interaction.output.usedFallback) {
      fallbackCount += 1;
    }
  }

  return {
    total: interactions.length,
    fallbackCount,
    byProvider,
    latestAt: interactions[0]?.createdAt
  };
}

async function readAiInteractionStore(storePath: string): Promise<AiInteractionStore> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AiInteractionStore>;

    return {
      interactions: Array.isArray(parsed.interactions) ? parsed.interactions : []
    };
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") {
      return { interactions: [] };
    }
    throw error;
  }
}

async function writeAiInteractionStore(store: AiInteractionStore, storePath: string): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(
    storePath,
    JSON.stringify(
      {
        version: aiInteractionStoreVersion,
        interactions: store.interactions
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
