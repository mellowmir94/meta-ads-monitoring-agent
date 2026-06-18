import { getLatestMetaAdsRun } from "@/lib/meta-ads/status-store";
import { buildStatusCommandMessage } from "@/lib/telegram/status";

export type TelegramWebhookUpdate = {
  message?: {
    chat?: {
      id?: number | string;
    };
    text?: string;
  };
};

export async function handleTelegramCommand(update: TelegramWebhookUpdate, expectedChatId: string) {
  const chatId = update.message?.chat?.id?.toString();
  const text = update.message?.text?.trim();

  if (!chatId || chatId !== expectedChatId) {
    return null;
  }

  if (text === "/status") {
    return buildStatusCommandMessage(await getLatestMetaAdsRun());
  }

  if (text === "/help") {
    return "Meta Ads Agent Commands\n\n/status - show last run status";
  }

  return null;
}
