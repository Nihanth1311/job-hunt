import "server-only";

// Free: create a bot with @BotFather, then message it once and read your chat id from
// https://api.telegram.org/bot<TOKEN>/getUpdates  (see README).

export interface TelegramKeys {
  telegramBotToken?: string;
  telegramChatId?: string;
}

export function telegramConfigured(keys: TelegramKeys): boolean {
  return Boolean(keys.telegramBotToken && keys.telegramChatId);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** `html` may use Telegram's basic tags (<b>, <i>, <a href>); escape any user text with escapeHtml. */
export async function sendTelegram(keys: TelegramKeys, html: string): Promise<void> {
  if (!telegramConfigured(keys)) throw new Error("Add your Telegram bot token and chat id in Settings → Your API keys first.");
  const res = await fetch(`https://api.telegram.org/bot${keys.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: keys.telegramChatId,
      text: html.slice(0, 4000),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram error ${res.status}: ${body.slice(0, 200)}`);
  }
}
