import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const requiredEnvVars = ["DATABASE_URL", "META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] as const;

export type SetupCheckItem = {
  name: string;
  ok: boolean;
  message: string;
};

export type SetupCheckResult = {
  ok: boolean;
  items: SetupCheckItem[];
  nextActions: string[];
};

function fileExists(path: string) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

export function runMetaAdsSetupCheck(cwd = process.cwd(), env: Record<string, string | undefined> = process.env): SetupCheckResult {
  const envPath = resolve(cwd, ".env");
  const supabaseEnvPath = resolve(cwd, "Supabase.env.txt");
  const supabaseEnvAltPath = resolve(cwd, "Supabase.env");
  const hasEnv = fileExists(envPath);
  const hasMisnamedSupabaseEnv = fileExists(supabaseEnvPath) || fileExists(supabaseEnvAltPath);

  const items: SetupCheckItem[] = [
    {
      name: ".env file",
      ok: hasEnv,
      message: hasEnv ? ".env exists in the project root." : ".env is missing from the project root."
    },
    {
      name: "Supabase env filename",
      ok: !hasMisnamedSupabaseEnv,
      message: hasMisnamedSupabaseEnv ? "Found Supabase.env/Supabase.env.txt. Rename the real config file to .env." : "No misnamed Supabase env file detected."
    },
    ...requiredEnvVars.map((name) => {
      const value = env[name];
      return {
        name,
        ok: Boolean(value && value.trim()),
        message: value && value.trim() ? `${name} is set.` : `${name} is missing.`
      };
    })
  ];

  const nextActions = [];
  if (!hasEnv) {
    nextActions.push("Create C:\\Users\\AmirKhalil\\Documents\\CC\\.env.");
  }
  if (hasMisnamedSupabaseEnv) {
    nextActions.push("Rename Supabase.env or Supabase.env.txt to .env, then add real values.");
  }
  if (!env.DATABASE_URL) {
    nextActions.push("Add Supabase Postgres URI as DATABASE_URL. It must start with postgresql://.");
  }
  if (!env.META_ACCESS_TOKEN || !env.META_AD_ACCOUNT_ID) {
    nextActions.push("Add Meta Marketing API access token and ad account ID.");
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    nextActions.push("Add Telegram bot token and chat ID.");
  }

  return {
    ok: items.every((item) => item.ok),
    items,
    nextActions
  };
}
