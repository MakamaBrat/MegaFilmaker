// api/upload.js — Загрузка файла + отправка видео в Telegram (всё в одном)
const busboy = require('busboy');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

export const config = { api: { bodyParser: false } };

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Отправить видео/документ в Telegram
function sendToTelegram(chatId, filePath, filename, format) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`[upload] Отправляем в Telegram: ${fileBuffer.length} байт`);

    const boundary = '----FormBoundary' + Date.now();
    const safeName = filename.replace(/[^\w\-\.]/g, '_');

    // Для GIF используем sendAnimation, иначе sendDocument (нет лимита 50MB)
    const isGif = format === 'gif';
    const tgMethod = isGif ? 'sendAnimation' : 'sendDocument';
    const fieldName = isGif ? 'animation' : 'document';

    const beforeFile =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${safeName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`;

    const afterFile = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(beforeFile),
      fileBuffer,
      Buffer.from(afterFile),
    ]);

    const tgReq = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/${tgMethod}`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, tgRes => {
      let raw = '';
      tgRes.on('data', c => raw += c);
      tgRes.on('end', () => {
        try {
          const result = JSON.parse(raw);
          console.log(`[upload] Telegram ответ: ${result.ok ? 'УСПЕХ' : 'ОШИБКА: ' + result.description}`);
          resolve(result);
        } catch (e) {
          console.error(`[upload] Ошибка парсинга Telegram: ${raw.substring(0, 200)}`);
          resolve({ ok: false, description: 'Parse error' });
        }
      });
    });

    tgReq.on('error', (err) => {
      console.error(`[upload] Ошибка HTTPS: ${err.message}`);
      reject(err);
    });

    tgReq.write(body);
    tgReq.end();
  });
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const bb = busboy({ headers: req.headers, limits: { fileSize: 200 * 1024 * 1024 } });

  const fileId = crypto.randomBytes(8).toString('hex');
  let filePath = '';
  let fileName = '';
  let fileSize = 0;
  let fileReceived = false;
  let chatId = '';
  let format = 'mp4';

  // Получаем поля формы (chat_id, format) — ВАЖНО: поля должны идти ДО файла
  bb.on('field', (name, val) => {
    console.log(`[upload] Поле ${name} = ${val}`);
    if (name === 'chat_id') chatId = val;
    if (name === 'format') format = val;
  });

  bb.on('file', (name, file, info) => {
    console.log(`[upload] Получен файл: ${info.filename}`);
    fileReceived = true;
    fileName = info.filename || 'video.mp4';
    const ext = path.extname(fileName).toLowerCase() || '.mp4';
    filePath = path.join('/tmp', `${fileId}${ext}`);

    const ws = fs.createWriteStream(filePath);
    file.on('data', chunk => { fileSize += chunk.length; });
    file.pipe(ws);

    file.on('error', (err) => {
      console.error(`[upload] Ошибка файла: ${err.message}`);
      ws.destroy();
      fs.unlink(filePath, () => {});
    });

    ws.on('error', (err) => {
      console.error(`[upload] Ошибка записи: ${err.message}`);
    });
  });

  bb.on('finish', async () => {
    if (!fileReceived || !filePath || !fs.existsSync(filePath)) {
      console.error('[upload] Файл не получен');
      if (!res.headersSent) return res.status(400).json({ error: 'No file received' });
      return;
    }

    const stat = fs.statSync(filePath);
    console.log(`[upload] Файл сохранён: ${filePath} (${stat.size} байт), chatId=${chatId}`);

    // Если есть chatId — сразу отправляем в Telegram
    if (chatId) {
      try {
        const result = await sendToTelegram(chatId, filePath, fileName, format);
        fs.unlink(filePath, () => {});

        if (result.ok) {
          if (!res.headersSent) return res.json({ success: true, sent: true, fileId });
        } else {
          if (!res.headersSent) return res.status(500).json({
            error: 'Telegram: ' + (result.description || 'unknown'), fileId
          });
        }
      } catch (e) {
        console.error(`[upload] Ошибка отправки: ${e.message}`);
        fs.unlink(filePath, () => {});
        if (!res.headersSent) return res.status(500).json({ error: 'Send error: ' + e.message, fileId });
      }
    } else {
      // Нет chatId — просто сохранили (для браузера)
      if (!res.headersSent) return res.json({ success: true, sent: false, fileId, fileName, fileSize: stat.size });
    }
  });

  bb.on('error', (err) => {
    console.error('[upload] Busboy error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  req.pipe(bb);
}
