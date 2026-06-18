import type { AiInteraction as PrismaAiInteraction, Prisma } from "@prisma/client";
import { type ApplySharpUserScope, getDemoUserScope } from "./auth-context";
import {
  type AiInteractionRecord,
  type AiInteractionSnapshotInput,
  listAiInteractionRecords,
  saveAiInteractionRecord
} from "./ai-interaction-store";
import { prisma } from "./prisma";

export type AiInteractionRepositoryMode = "local-json" | "prisma" | "prisma-fallback-local-json";

export type AiInteractionRepositoryResult<T> = {
  data: T;
  storage: AiInteractionRepositoryMode;
  warning?: string;
};

export function shouldUsePrismaAiInteractionStore(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.APPLYSHARP_AI_INTERACTION_STORE === "prisma";
}

export async function listAiInteractions(userScope?: ApplySharpUserScope): Promise<AiInteractionRepositoryResult<AiInteractionRecord[]>> {
  if (!shouldUsePrismaAiInteractionStore()) {
    return { data: await listAiInteractionRecords(), storage: "local-json" };
  }

  try {
    const user = await getOrCreatePrismaUser(userScope);
    const interactions = await prisma.aiInteraction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return {
      data: interactions.map(mapPrismaAiInteractionToRecord),
      storage: "prisma"
    };
  } catch (error) {
    return {
      data: await listAiInteractionRecords(),
      storage: "prisma-fallback-local-json",
      warning: error instanceof Error ? error.message : "Prisma AI interaction list failed."
    };
  }
}

export async function saveAiInteraction(input: AiInteractionSnapshotInput, userScope?: ApplySharpUserScope): Promise<AiInteractionRepositoryResult<AiInteractionRecord>> {
  if (!shouldUsePrismaAiInteractionStore()) {
    return { data: await saveAiInteractionRecord(input), storage: "local-json" };
  }

  try {
    const user = await getOrCreatePrismaUser(userScope);
    const interaction = await prisma.aiInteraction.create({
      data: {
        userId: user.id,
        intent: input.intent,
        provider: input.provider,
        model: input.model,
        promptHash: input.promptHash,
        inputSummary: input.inputSummary,
        output: input.output as unknown as Prisma.InputJsonValue,
        warnings: input.warnings
      }
    });

    return {
      data: mapPrismaAiInteractionToRecord(interaction),
      storage: "prisma"
    };
  } catch (error) {
    return {
      data: await saveAiInteractionRecord(input),
      storage: "prisma-fallback-local-json",
      warning: error instanceof Error ? error.message : "Prisma AI interaction save failed."
    };
  }
}

export function mapPrismaAiInteractionToRecord(interaction: PrismaAiInteraction): AiInteractionRecord {
  return {
    id: interaction.id,
    createdAt: interaction.createdAt.toISOString(),
    intent: interaction.intent as AiInteractionRecord["intent"],
    provider: interaction.provider,
    model: interaction.model,
    promptHash: interaction.promptHash,
    inputSummary: interaction.inputSummary,
    output: interaction.output as AiInteractionRecord["output"],
    warnings: interaction.warnings
  };
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
