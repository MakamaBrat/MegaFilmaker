// api/webhook.js — Telegram Bot (только /start)
// Чистый ESM — работает на Vercel

export const config = { api: { bodyParser: true } };

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG = `https://api.telegram.org/bot${TOKEN}`;

async function tgCall(method, body) {
  const r = await fetch(`${TG}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const update = req.body;
  try {
    const msg = update?.message;
    if (!msg) return res.status(200).json({ ok: true });

    const chatId = msg.chat.id;

    if (msg.text === '/start') {
      // APP_URL ставится в env на Vercel, или берём из VERCEL_URL
      const host = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
      const appUrl = host || 'https://your-app.vercel.app'; // замени на свой URL

      await tgCall('sendMessage', {
        chat_id: chatId,
        text: '✂️ Привет! Нажми кнопку ниже, чтобы открыть видеоредактор.\n\nОбрезай, поворачивай, меняй скорость — и получай готовое видео прямо в чат!',
        reply_markup: {
          keyboard: [[{ text: '✂️ Открыть ВидеоРез', web_app: { url: appUrl } }]],
          resize_keyboard: true,
          persistent: true,
        },
      });
    }
  } catch (e) {
    console.error('[webhook] Error:', e.message);
  }

  return res.status(200).json({ ok: true });
}
