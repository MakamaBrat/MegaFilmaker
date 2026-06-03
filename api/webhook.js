// api/webhook.js — Telegram webhook (только команда /start)
// Отправка видео теперь происходит в upload.js напрямую
const https = require('https');

export const config = { api: { bodyParser: true } };

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function tgCall(method, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const update = req.body;

  try {
    const msg = update?.message;
    if (!msg) return res.status(200).json({ ok: true });

    const chatId = msg.chat.id;

    // ── /start ──
    if (msg.text === '/start') {
      const host = process.env.VERCEL_URL || process.env.APP_URL;
      const appUrl = host ? `https://${host}` : 'https://mega-filmaker.vercel.app';

      console.log(`[webhook] /start от ${chatId}, URL: ${appUrl}`);

      await tgCall('sendMessage', {
        chat_id: chatId,
        text: '✂️ Привет! Нажми кнопку ниже, чтобы открыть редактор видео.\n\nОбрезай, поворачивай, меняй скорость — и получай готовое видео прямо в чат!',
        reply_markup: {
          inline_keyboard: [[{
            text: '✂️ Открыть ВидеоРез',
            web_app: { url: appUrl },
          }]],
        },
      });
      return res.status(200).json({ ok: true });
    }

  } catch (e) {
    console.error('[webhook] Ошибка:', e.message);
  }

  return res.status(200).json({ ok: true });
}
