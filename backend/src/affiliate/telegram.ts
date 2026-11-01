// Telegram notifications for affiliates. Configure TELEGRAM_BOT_TOKEN in the server .env; without it
// the feature reports "not configured". Affiliates link a chat by sending "/start <code>" to the bot.
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
let botUsername: string | null = null;
let offset = 0;
let polling = false;

async function api<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!token()) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 35_000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    const j = (await res.json()) as { ok: boolean; result: T };
    return j.ok ? j.result : null;
  } catch {
    return null;
  } finally { clearTimeout(t); }
}

export function telegramStatus() { return { configured: !!token(), botUsername }; }

export async function sendTelegram(affiliateId: string, text: string): Promise<void> {
  if (!token()) return;
  const a = await prisma.affiliate.findUnique({ where: { id: affiliateId }, select: { telegramChatId: true } });
  if (a?.telegramChatId) await api('sendMessage', { chat_id: a.telegramChatId, text });
}

/** Long-poll the bot for "/start CODE" messages that link a chat to an affiliate. */
export function startTelegramBot(): void {
  if (!token() || polling) return;
  polling = true;
  void (async () => {
    const me = await api<{ username: string }>('getMe', {});
    botUsername = me?.username ?? null;
    if (!me) { logger.warn('telegram bot token rejected'); polling = false; return; }
    logger.info({ bot: botUsername }, 'telegram bot started');
    for (;;) {
      const updates = await api<Array<{ update_id: number; message?: { chat: { id: number }; text?: string } }>>('getUpdates', { offset, timeout: 30 });
      for (const u of updates ?? []) {
        offset = u.update_id + 1;
        const m = u.message?.text?.match(/^\/start\s+([A-Z0-9]{6,16})$/i);
        if (!m || !u.message) continue;
        const aff = await prisma.affiliate.findUnique({ where: { telegramCode: m[1].toUpperCase() } });
        if (!aff) { await api('sendMessage', { chat_id: u.message.chat.id, text: 'This link code is not valid. Open the Telegram page in the Aurelix Affiliate Center to get a new one.' }); continue; }
        await prisma.affiliate.update({ where: { id: aff.id }, data: { telegramChatId: String(u.message.chat.id), telegramCode: null } });
        await api('sendMessage', { chat_id: u.message.chat.id, text: 'Connected to the Aurelix Affiliate Center. You will get notifications about registrations, first deposits and payouts here.' });
      }
      if (!updates) await new Promise((r) => setTimeout(r, 5000));
    }
  })();
}
