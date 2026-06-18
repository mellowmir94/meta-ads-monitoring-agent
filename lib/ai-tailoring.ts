import { createHash } from "node:crypto";
import {
  buildTailoredResumePrompt,
  buildApplyActions,
  generateTailoredApplicationAssets,
  type FitResult,
  type JobListing,
  type TailoredApplicationAssets
} from "./applysharp";

export type AiProviderName = "openai" | "grok" | "deterministic";

export type AiTailoringOptions = {
  provider?: AiProviderName;
  apiKey?: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type AiTailoringResult = {
  assets: TailoredApplicationAssets;
  provider: AiProviderName;
  model: string;
  promptHash: string;
  usedFallback: boolean;
  fallbackReason?: string;
  warnings: string[];
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ProviderConfig = {
  provider: AiProviderName;
  apiKey?: string;
  model: string;
  endpoint: string;
};

export function resolveAiProviderConfig(env: Partial<NodeJS.ProcessEnv> = process.env): ProviderConfig {
  const provider = normalizeProvider(env.AI_PROVIDER);

  if (provider === "grok") {
    return {
      provider,
      apiKey: env.GROK_API_KEY,
      model: env.GROK_MODEL || env.AI_MODEL || "grok-2-latest",
      endpoint: env.GROK_API_BASE_URL || "https://api.x.ai/v1/chat/completions"
    };
  }

  if (provider === "openai") {
    return {
      provider,
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || env.AI_MODEL || "gpt-4o-mini",
      endpoint: env.OPENAI_API_BASE_URL || "https://api.openai.com/v1/chat/completions"
    };
  }

  return {
    provider: "deterministic",
    model: "deterministic-v1",
    endpoint: "local"
  };
}

export function buildTailoringMessages(masterResumeText: string, job: JobListing, fit: FitResult): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are ApplySharp's resume tailoring engine.",
        "Use only facts explicitly supported by the master resume.",
        "Never invent skills, tools, companies, years, certificates, salary, achievements, or seniority.",
        "If a JD keyword is not supported, include it only in unsupportedClaims, not in resumeMarkdown.",
        "Return valid JSON only. No markdown fences. No commentary outside JSON."
      ].join("\n")
    },
    {
      role: "user",
      content: `${buildTailoredResumePrompt(masterResumeText, job, fit)}

Return this exact JSON shape:
{
  "resumeMarkdown": "ATS-safe markdown with standard headings and bullets only",
  "coverLetter": "Concise truthful cover letter",
  "emailSubject": "Application for ...",
  "emailBody": "Concise HR email",
  "truthMap": { "keyword": "master resume evidence" },
  "unsupportedClaims": ["JD keyword not proven by master resume"]
}

Do not include tables, graphics, columns, or unsupported claims in the resume.`
    }
  ];
}

export async function generateTailoredApplicationAssetsWithAi(
  masterResumeText: string,
  job: JobListing,
  fit: FitResult,
  options: AiTailoringOptions = {}
): Promise<AiTailoringResult> {
  const deterministicAssets = generateTailoredApplicationAssets(masterResumeText, job, fit);
  const config = {
    ...resolveAiProviderConfig(),
    ...cleanOptions(options)
  };
  const messages = buildTailoringMessages(masterResumeText, job, fit);
  const promptHash = hashPrompt(messages);

  if (config.provider === "deterministic") {
    return fallbackResult(deterministicAssets, config.provider, config.model, promptHash, "AI provider disabled.");
  }
  if (!config.apiKey) {
    return fallbackResult(deterministicAssets, config.provider, config.model, promptHash, `Missing ${config.provider} API key.`);
  }

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000)
    });

    if (!response.ok) {
      return fallbackResult(deterministicAssets, config.provider, config.model, promptHash, `AI provider returned HTTP ${response.status}.`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsedAssets = parseProviderAssets(content, deterministicAssets, job);

    return {
      assets: parsedAssets,
      provider: config.provider,
      model: config.model,
      promptHash,
      usedFallback: false,
      warnings: ["AI-generated assets must be reviewed against the master resume before applying."]
    };
  } catch (error) {
    return fallbackResult(
      deterministicAssets,
      config.provider,
      config.model,
      promptHash,
      error instanceof Error ? error.message : "AI provider call failed."
    );
  }
}

function cleanOptions(options: AiTailoringOptions): Partial<ProviderConfig> {
  const cleaned: Partial<ProviderConfig> = {};

  if (options.provider) cleaned.provider = options.provider;
  if (options.apiKey) cleaned.apiKey = options.apiKey;
  if (options.model) cleaned.model = options.model;
  if (options.endpoint) cleaned.endpoint = options.endpoint;

  return cleaned;
}

function parseProviderAssets(content: unknown, fallback: TailoredApplicationAssets, job: JobListing): TailoredApplicationAssets {
  if (typeof content !== "string") {
    throw new Error("AI response did not include text content.");
  }

  const parsed = JSON.parse(content) as Partial<TailoredApplicationAssets>;
  const requiredStrings = ["resumeMarkdown", "coverLetter", "emailSubject", "emailBody"] as const;

  for (const key of requiredStrings) {
    if (typeof parsed[key] !== "string" || !parsed[key]?.trim()) {
      throw new Error(`AI response missing ${key}.`);
    }
  }

  return {
    resumeMarkdown: parsed.resumeMarkdown!,
    coverLetter: parsed.coverLetter!,
    emailSubject: parsed.emailSubject!,
    emailBody: parsed.emailBody!,
    truthMap: isRecord(parsed.truthMap) ? parsed.truthMap : fallback.truthMap,
    unsupportedClaims: Array.isArray(parsed.unsupportedClaims) ? parsed.unsupportedClaims.filter((item) => typeof item === "string") : fallback.unsupportedClaims,
    pdfFileName: fallback.pdfFileName,
    applyActions: buildApplyActions(job, parsed.emailSubject!, parsed.emailBody!)
  };
}

function fallbackResult(
  assets: TailoredApplicationAssets,
  provider: AiProviderName,
  model: string,
  promptHash: string,
  reason: string
): AiTailoringResult {
  return {
    assets,
    provider,
    model,
    promptHash,
    usedFallback: true,
    fallbackReason: reason,
    warnings: [reason, "Deterministic truthful tailoring fallback was used."]
  };
}

function hashPrompt(messages: ChatMessage[]): string {
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex").slice(0, 24);
}

function normalizeProvider(value: string | undefined): AiProviderName {
  if (value === "grok" || value === "openai" || value === "deterministic") {
    return value;
  }

  return "deterministic";
}

function isRecord(value: unknown): value is Record<string, string> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
