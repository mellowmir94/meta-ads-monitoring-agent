import {
  defaultApiRateLimit,
  evaluateRateLimit,
  type RateLimitEntry,
  type RateLimitOptions,
  type RateLimitResult
} from "./security";

export type RateLimitStorageMode = "memory" | "redis" | "redis-fallback-memory";

export type RedisRateLimitConfig = {
  enabled: boolean;
  restUrl?: string;
  token?: string;
  namespace: string;
  failClosed: boolean;
};

export type ApiRateLimitInput = {
  store: Map<string, RateLimitEntry>;
  key: string;
  now: number;
  options?: RateLimitOptions;
  env?: Partial<NodeJS.ProcessEnv>;
  fetcher?: typeof fetch;
};

export type ApiRateLimitResult = RateLimitResult & {
  storage: RateLimitStorageMode;
  warning?: string;
};

type RedisPipelineResponse = Array<{ result?: unknown; error?: string }>;

export function resolveRedisRateLimitConfig(env: Partial<NodeJS.ProcessEnv> = process.env): RedisRateLimitConfig {
  const restUrl = env.UPSTASH_REDIS_REST_URL || env.REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.REDIS_REST_TOKEN;

  return {
    enabled: Boolean(restUrl && token),
    restUrl,
    token,
    namespace: sanitizeNamespace(env.META_ADS_RATE_LIMIT_NAMESPACE || "meta-ads-monitoring-agent"),
    failClosed: env.META_ADS_RATE_LIMIT_FAIL_CLOSED === "true"
  };
}

export function getRateLimitStorageMode(config: RedisRateLimitConfig = resolveRedisRateLimitConfig()): RateLimitStorageMode {
  return config.enabled ? "redis" : "memory";
}

export async function evaluateApiRateLimit({
  store,
  key,
  now,
  options = defaultApiRateLimit,
  env = process.env,
  fetcher = fetch
}: ApiRateLimitInput): Promise<ApiRateLimitResult> {
  const config = resolveRedisRateLimitConfig(env);

  if (!config.enabled) {
    return {
      ...evaluateRateLimit(store, key, now, options),
      storage: "memory"
    };
  }

  try {
    return {
      ...(await evaluateRedisFixedWindowRateLimit(config, key, now, options, fetcher)),
      storage: "redis"
    };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "Redis rate limit failed.";

    if (config.failClosed) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + options.windowMs,
        retryAfterSeconds: Math.max(1, Math.ceil(options.windowMs / 1000)),
        storage: "redis",
        warning
      };
    }

    return {
      ...evaluateRateLimit(store, key, now, options),
      storage: "redis-fallback-memory",
      warning
    };
  }
}

export async function evaluateRedisFixedWindowRateLimit(
  config: RedisRateLimitConfig,
  key: string,
  now: number,
  options: RateLimitOptions = defaultApiRateLimit,
  fetcher: typeof fetch = fetch
): Promise<RateLimitResult> {
  if (!config.enabled || !config.restUrl || !config.token) {
    throw new Error("Redis rate limit is not configured.");
  }

  const bucket = Math.floor(now / options.windowMs);
  const resetAt = (bucket + 1) * options.windowMs;
  const redisKey = `${config.namespace}:rate:${bucket}:${key}`;
  const response = await fetcher(`${trimTrailingSlash(config.restUrl)}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["PEXPIRE", redisKey, Math.ceil(options.windowMs * 2)]
    ])
  });

  if (!response.ok) {
    throw new Error(`Redis rate limit request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as RedisPipelineResponse;
  const count = parsePipelineNumber(payload, 0);
  const allowed = count <= options.limit;

  return {
    allowed,
    remaining: allowed ? Math.max(0, options.limit - count) : 0,
    resetAt,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000))
  };
}

export function createRateLimitKey(clientKey: string, pathname: string): string {
  return `${clientKey}:${pathname}`;
}

function parsePipelineNumber(payload: RedisPipelineResponse, index: number): number {
  if (!Array.isArray(payload)) {
    throw new Error("Redis rate limit response was not a pipeline array.");
  }

  const item = payload[index];

  if (!item || item.error) {
    throw new Error(item?.error || "Redis rate limit response was missing increment result.");
  }

  const value = typeof item.result === "number" ? item.result : Number(item.result);

  if (!Number.isFinite(value)) {
    throw new Error("Redis rate limit increment result was not numeric.");
  }

  return value;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function sanitizeNamespace(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "meta-ads-monitoring-agent";
}
