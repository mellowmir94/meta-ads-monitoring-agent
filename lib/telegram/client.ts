import { metaAdsLogger } from "@/lib/meta-ads/logger";

type TelegramClientOptions = {
  botToken: string;
  chatId: string;
  maxRetries?: number;
};

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TelegramClient {
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly maxRetries: number;

  constructor(options: TelegramClientOptions) {
    this.botToken = options.botToken;
    this.chatId = options.chatId;
    this.maxRetries = options.maxRetries ?? 3;
  }

  async sendMessage(text: string) {
    return this.request("sendMessage", {
      chat_id: this.chatId,
      text,
      disable_web_page_preview: true
    });
  }

  private async request<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = (await response.json()) as TelegramResponse<T>;

        if (!response.ok || !body.ok) {
          throw new Error(body.description ?? `Telegram API request failed with ${response.status}`);
        }

        return body.result as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown Telegram API error");
        metaAdsLogger.warn("Telegram API request retry", { method, attempt, maxRetries: this.maxRetries });

        if (attempt < this.maxRetries) {
          await sleep(500 * attempt);
        }
      }
    }

    throw lastError ?? new Error("Telegram API request failed");
  }
}
