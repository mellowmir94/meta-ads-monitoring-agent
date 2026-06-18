import { metaAdsLogger } from "@/lib/meta-ads/logger";
import type { MetaApiEntity, MetaEntityLevel, MetaInsightsRow } from "@/lib/meta/types";

type MetaClientOptions = {
  accessToken: string;
  adAccountId: string;
  apiVersion?: string;
  maxRetries?: number;
};

type MetaListResponse<T> = {
  data?: T[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    code?: number;
  };
};

const insightsFields = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "frequency",
  "actions",
  "date_start",
  "date_stop"
];

function normalizeAdAccountId(adAccountId: string) {
  return adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MetaMarketingClient {
  private readonly accessToken: string;
  private readonly adAccountId: string;
  private readonly apiVersion: string;
  private readonly maxRetries: number;

  constructor(options: MetaClientOptions) {
    this.accessToken = options.accessToken;
    this.adAccountId = normalizeAdAccountId(options.adAccountId);
    this.apiVersion = options.apiVersion ?? "v21.0";
    this.maxRetries = options.maxRetries ?? 3;
  }

  async getInsights(level: MetaEntityLevel, datePreset = "yesterday"): Promise<MetaInsightsRow[]> {
    const params = new URLSearchParams({
      access_token: this.accessToken,
      fields: insightsFields.join(","),
      level,
      date_preset: datePreset,
      time_increment: "1",
      limit: "500"
    });

    return this.getPaginated<MetaInsightsRow>(`/${this.adAccountId}/insights?${params.toString()}`);
  }

  async listEntities(level: MetaEntityLevel): Promise<MetaApiEntity[]> {
    const edge = level === "campaign" ? "campaigns" : level === "adset" ? "adsets" : "ads";
    const fields = level === "campaign" ? "id,name,status,effective_status" : "id,name,status,effective_status,campaign_id,adset_id";
    const params = new URLSearchParams({
      access_token: this.accessToken,
      fields,
      limit: "500"
    });

    return this.getPaginated<MetaApiEntity>(`/${this.adAccountId}/${edge}?${params.toString()}`);
  }

  private async getPaginated<T>(pathWithQuery: string): Promise<T[]> {
    const rows: T[] = [];
    let nextUrl: string | undefined = this.buildUrl(pathWithQuery);

    while (nextUrl) {
      const page: MetaListResponse<T> = await this.fetchJson<MetaListResponse<T>>(nextUrl);
      rows.push(...(page.data ?? []));
      nextUrl = page.paging?.next;
    }

    return rows;
  }

  private buildUrl(pathWithQuery: string) {
    return `https://graph.facebook.com/${this.apiVersion}${pathWithQuery}`;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await fetch(url, { method: "GET" });
        const body = (await response.json()) as MetaListResponse<unknown>;

        if (!response.ok || body.error) {
          const message = body.error?.message ?? `Meta API request failed with ${response.status}`;
          throw new Error(message);
        }

        return body as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown Meta API error");
        metaAdsLogger.warn("Meta API request retry", { attempt, maxRetries: this.maxRetries });

        if (attempt < this.maxRetries) {
          await sleep(500 * attempt);
        }
      }
    }

    throw lastError ?? new Error("Meta API request failed");
  }
}
