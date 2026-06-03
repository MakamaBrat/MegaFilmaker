// api/webhook.js — Telegram webhook с подробным логированием для отладки
const https = require('https');
const fs    = require('fs');
const path  = require('path');

export const config = { api: { bodyParser: true, responseLimit: false } };

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

// Отправить файл в Telegram ДОКУМЕНТОМ вместо видео (обходит лимит 50MB)
function sendVideoToUser(chatId, fileId, fmt, name) {
  return new Promise((resolve, reject) => {
    // 🔴 ВАЖНО: Читаем файл локально, не через HTTP
    const ext = fmt === 'gif' ? 'gif' : fmt === 'webm' ? 'webm' : fmt === 'mov' ? 'mov' : 'mp4';
    const filePath = path.join('/tmp', `${fileId}.${ext}`);
    
    console.log(`\n[webhook DEBUG] ============================================`);
    console.log(`[webhook DEBUG] Начало отправки видео`);
    console.log(`[webhook DEBUG] fileId=${fileId}, format=${fmt}`);
    console.log(`[webhook DEBUG] filePath=${filePath}`);

    // Проверяем что файл СУЩЕСТВУЕТ
    if (!fs.existsSync(filePath)) {
      console.error(`[webhook DEBUG] ❌ ФАЙЛ НЕ НАЙДЕН!`);
      
      // Показываем какие файлы есть в /tmp
      const tmpDir = '/tmp';
      try {
        const allFiles = fs.readdirSync(tmpDir);
        const ourFiles = allFiles.filter(f => f.startsWith(fileId));
        console.error(`[webhook DEBUG] Все файлы в /tmp: ${allFiles.slice(0, 20).join(', ')}...`);
        console.error(`[webhook DEBUG] Файлы с ID ${fileId}: ${ourFiles.join(', ')}`);
      } catch (e) {
        console.error(`[webhook DEBUG] Ошибка чтения /tmp: ${e.message}`);
      }
      
      return reject(new Error(`Файл не найден: ${filePath}`));
    }

    const stat = fs.statSync(filePath);
    console.log(`[webhook DEBUG] ✓ Файл найден: ${stat.size} байт (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

    // 🔴 ВАЖНО: Вместо sendVideo используем sendDocument (нет лимита 50MB!)
    // Это обходит ошибку 413
    const filename = name || `video.${ext}`;
    const mime = 'application/octet-stream';  // Универсальный MIME тип
    const tgMethod = 'sendDocument';  // ВСЕГДА используем sendDocument!
    const fieldName = 'document';

    console.log(`[webhook DEBUG] Отправляем как ДОКУМЕНТ (sendDocument)`);
    console.log(`[webhook DEBUG] Размер для отправки: ${stat.size} байт`);

    // Multipart upload STREAMING
    const boundary = 'TGBound' + Date.now();
    
    const header = 
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`;

    const tail = `\r\n--${boundary}--\r\n`;
    const headerBuf = Buffer.from(header);
    const tailBuf = Buffer.from(tail);
    const totalSize = headerBuf.length + stat.size + tailBuf.length;

    console.log(`[webhook DEBUG] Total request size: ${totalSize} байт (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/${tgMethod}`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalSize,
      },
    }, res => {
      console.log(`[webhook DEBUG] Telegram ответил: HTTP ${res.statusCode}`);
      
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { 
          const result = JSON.parse(raw);
          console.log(`[webhook DEBUG] Telegram result: ${JSON.stringify(result).substring(0, 200)}`);
          console.log(`[webhook DEBUG] ============================================\n`);
          resolve(result); 
        } catch (e) { 
          console.error(`[webhook DEBUG] Ошибка парсинга: ${e.message}`);
          resolve({}); 
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[webhook DEBUG] ❌ Ошибка HTTPS: ${err.message}`);
      console.error(`[webhook DEBUG] ============================================\n`);
      reject(err);
    });

    console.log(`[webhook DEBUG] Пишем header...`);
    req.write(headerBuf);

    console.log(`[webhook DEBUG] Пишем файл STREAMING...`);
    const stream = fs.createReadStream(filePath);
    let bytesSent = 0;
    
    stream.on('data', (chunk) => {
      bytesSent += chunk.length;
      if (bytesSent % (5 * 1024 * 1024) === 0) {  // Логируем каждые 5MB
        console.log(`[webhook DEBUG] Отправлено ${(bytesSent / 1024 / 1024).toFixed(1)} MB...`);
      }
    });

    stream.pipe(req, { end: false });

    stream.on('end', () => {
      console.log(`[webhook DEBUG] Файл полностью прочитан (${bytesSent} байт), пишем tail...`);
      req.write(tailBuf);
      req.end();
    });

    stream.on('error', (err) => {
      console.error(`[webhook DEBUG] ❌ Ошибка чтения файла: ${err.message}`);
      console.error(`[webhook DEBUG] ============================================\n`);
      req.destroy();
      reject(err);
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const update = req.body;

  try {
    const msg = update?.message;
    if (!msg) return res.status(200).json({ ok: true });

    const chatId = msg.chat.id;

    if (msg.text === '/start') {
      const host = process.env.VERCEL_URL || process.env.APP_URL;
      const appUrl = host ? `https://${host}` : 'https://your-app-url.vercel.app';
      
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

    if (msg.web_app_data?.data) {
      let data;
      try { data = JSON.parse(msg.web_app_data.data); }
      catch { 
        console.error('[webhook] Ошибка парсинга web_app_data');
        return res.status(200).json({ ok: true }); 
      }

      if (data.action !== 'send_video') {
        return res.status(200).json({ ok: true }); 
      }

      console.log(`[webhook] Получена команда: fileId=${data.fileId}, format=${data.format}`);

      await tgCall('sendMessage', {
        chat_id: chatId,
        text: '⏳ Видео получено, отправляю...',
      });

      // ВАЖНО: Отправляем в фоне, но сразу возвращаем ответ Telegram
      setImmediate(async () => {
        try {
          const result = await sendVideoToUser(chatId, data.fileId, data.format || 'mp4', data.name || 'video.mp4');
          
          if (!result.ok) {
            const desc = result.description || 'неизвестная ошибка';
            console.error(`[webhook] Telegram ошибка: ${desc}`);
            
            await tgCall('sendMessage', {
              chat_id: chatId,
              text: `❌ Ошибка Telegram:\n\n${desc}`,
            });
          } else {
            console.log(`[webhook] ✓ Видео успешно отправлено!`);
          }
        } catch (e) {
          console.error(`[webhook] ❌ ОШИБКА: ${e.message}`);
          await tgCall('sendMessage', {
            chat_id: chatId,
            text: `❌ Ошибка:\n\n${e.message}`,
          });
        }
      });

      return res.status(200).json({ ok: true });
    }

  } catch (e) {
    console.error('[webhook] Критическая ошибка:', e.message);
  }

  return res.status(200).json({ ok: true });
}
