import { z } from "zod";

const metaAdsEnvSchema = z.object({
  META_ACCESS_TOKEN: z.string().min(1),
  META_AD_ACCOUNT_ID: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  META_GRAPH_API_VERSION: z.string().min(1).default("v21.0"),
  META_ADS_TIMEZONE: z.string().min(1).default("Asia/Kuala_Lumpur"),
  META_ADS_DAILY_REPORT_TIME: z.string().min(1).default("08:00"),
  META_ADS_RUN_SECRET: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional()
});

export type MetaAdsEnv = z.infer<typeof metaAdsEnvSchema>;

export function getMetaAdsEnv(): MetaAdsEnv {
  return metaAdsEnvSchema.parse(process.env);
}

export function getOptionalMetaAdsEnv() {
  return metaAdsEnvSchema.partial().safeParse(process.env);
}
