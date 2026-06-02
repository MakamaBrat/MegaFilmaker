// api/webhook.js — Telegram webhook
// Получает web_app_data от Mini App, скачивает видео с /tmp и отправляет пользователю

const https = require('https');
const fs    = require('fs');
const path  = require('path');

export const config = { api: { bodyParser: true, responseLimit: false } };

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Простой POST к Telegram Bot API (JSON)
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

// Скачать файл из нашего /tmp через /api/download и отправить боту как видео
function sendVideoToUser(chatId, fileId, fmt, name) {
  return new Promise((resolve, reject) => {
    // Строим URL нашего сервера
    const host = process.env.APP_URL || process.env.VERCEL_URL;
    const dlUrl = `https://${host}/api/download?outId=${fileId}&format=${fmt}&name=${encodeURIComponent(name)}`;

    https.get(dlUrl, dlRes => {
      if (dlRes.statusCode !== 200) {
        return reject(new Error(`Ошибка скачивания файла: HTTP ${dlRes.statusCode}`));
      }

      const chunks = [];
      dlRes.on('data', c => chunks.push(c));
      dlRes.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length === 0) return reject(new Error('Файл пустой'));

        // Multipart upload в Telegram
        const boundary = 'TGBound' + Date.now();
        const filename  = name || `video.${fmt}`;
        const mime      = fmt === 'gif' ? 'image/gif' : fmt === 'webm' ? 'video/webm' : 'video/mp4';
        const tgMethod  = fmt === 'gif' ? 'sendAnimation' : 'sendVideo';
        const fieldName = fmt === 'gif' ? 'animation' : 'video';

        const head = Buffer.from(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="supports_streaming"\r\n\r\ntrue\r\n` +
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
          `Content-Type: ${mime}\r\n\r\n`
        );
        const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([head, buf, tail]);

        const req = https.request({
          hostname: 'api.telegram.org',
          path: `/bot${TOKEN}/${tgMethod}`,
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
        }, r => {
          let raw = '';
          r.on('data', c => raw += c);
          r.on('end', () => {
            try { resolve(JSON.parse(raw)); } catch { resolve({}); }
          });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });
    }).on('error', reject);
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
      const host = process.env.APP_URL || process.env.VERCEL_URL;
      await tgCall('sendMessage', {
        chat_id: chatId,
        text: '✂️ Привет! Нажми кнопку ниже, чтобы открыть редактор видео.\n\nОбрезай, поворачивай, меняй скорость — и получай готовое видео прямо в чат!',
        reply_markup: {
          inline_keyboard: [[{
            text: '✂️ Открыть ВидеоРез',
            web_app: { url: `https://${host}` },
          }]],
        },
      });
      return res.status(200).json({ ok: true });
    }

    // ── web_app_data ──
    if (msg.web_app_data?.data) {
      let data;
      try { data = JSON.parse(msg.web_app_data.data); }
      catch { return res.status(200).json({ ok: true }); }

      if (data.action !== 'send_video') return res.status(200).json({ ok: true });

      // Сообщаем пользователю что получили
      await tgCall('sendMessage', {
        chat_id: chatId,
        text: '⏳ Видео получено, отправляю...',
      });

      // Скачиваем и отправляем — ПЕРЕД тем как ответить Telegram
      try {
        const result = await sendVideoToUser(chatId, data.fileId, data.format || 'mp4', data.name || 'video.mp4');
        if (!result.ok) {
          await tgCall('sendMessage', {
            chat_id: chatId,
            text: `❌ Не удалось отправить: ${result.description || 'неизвестная ошибка'}\n\nВозможно файл слишком большой (лимит Telegram — 50 МБ).`,
          });
        }
      } catch (e) {
        await tgCall('sendMessage', {
          chat_id: chatId,
          text: `❌ Ошибка: ${e.message}`,
        });
      }

      return res.status(200).json({ ok: true });
    }

  } catch (e) {
    console.error('Webhook error:', e.message);
  }

  return res.status(200).json({ ok: true });
}
