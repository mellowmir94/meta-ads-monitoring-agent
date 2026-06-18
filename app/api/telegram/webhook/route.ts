import { NextResponse } from "next/server";

import { getMetaAdsEnv } from "@/lib/meta-ads/env";
import { metaAdsLogger } from "@/lib/meta-ads/logger";
import { handleTelegramCommand, type TelegramWebhookUpdate } from "@/lib/telegram/commands";
import { TelegramClient } from "@/lib/telegram/client";

export async function POST(request: Request) {
  const env = getMetaAdsEnv();
  const secret = request.headers.get("x-telegram-bot-api-secret-token");

  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const update = (await request.json()) as TelegramWebhookUpdate;
    const response = await handleTelegramCommand(update, env.TELEGRAM_CHAT_ID);

    if (response) {
      const telegram = new TelegramClient({ botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID });
      await telegram.sendMessage(response);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    metaAdsLogger.error("Telegram webhook failed");
    return NextResponse.json({ error: "Telegram webhook failed" }, { status: 500 });
  }
}
