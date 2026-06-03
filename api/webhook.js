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

// Скачать файл с диска и отправить в Telegram используя streaming
function sendVideoToUser(chatId, fileId, fmt, name) {
  return new Promise((resolve, reject) => {
    const host = process.env.VERCEL_URL || process.env.APP_URL;
    
    if (!host) {
      return reject(new Error('VERCEL_URL не установлена в переменных окружения'));
    }

    // Определяем файл локально (не скачиваем через HTTP)
    const ext = fmt === 'gif' ? 'gif' : fmt === 'webm' ? 'webm' : fmt === 'mov' ? 'mov' : 'mp4';
    const filePath = path.join('/tmp', `${fileId}.${ext}`);
    
    console.log('[webhook] Ищем файл локально:', filePath);

    // Проверяем что файл существует
    if (!fs.existsSync(filePath)) {
      console.error(`[webhook] Файл не найден: ${filePath}`);
      const tmpDir = '/tmp';
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(fileId));
      console.log(`[webhook] Доступные файлы: ${files.join(', ')}`);
      return reject(new Error(`Файл не найден: ${filePath}. Доступно: ${files.join(', ')}`));
    }

    const stat = fs.statSync(filePath);
    console.log(`[webhook] Файл найден: ${filePath} (${stat.size} байт)`);

    // Проверяем размер (лимит Telegram 50MB для видео)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (stat.size > maxSize) {
      return reject(new Error(`Файл слишком большой: ${Math.round(stat.size / 1024 / 1024)}MB (максимум 50MB)`));
    }

    // Multipart upload в Telegram используя STREAMING
    const boundary = 'TGBound' + Date.now();
    const filename = name || `video.${ext}`;
    const mime = fmt === 'gif' ? 'image/gif' : fmt === 'webm' ? 'video/webm' : 'video/mp4';
    const tgMethod = fmt === 'gif' ? 'sendAnimation' : 'sendVideo';
    const fieldName = fmt === 'gif' ? 'animation' : 'video';

    // Создаем header для multipart
    const header = 
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="supports_streaming"\r\n\r\ntrue\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`;

    const tail = `\r\n--${boundary}--\r\n`;
    
    // Вычисляем размер тела (для Content-Length)
    const headerBuf = Buffer.from(header);
    const tailBuf = Buffer.from(tail);
    const totalSize = headerBuf.length + stat.size + tailBuf.length;

    console.log(`[webhook] Отправляем в Telegram: ${totalSize} байт`);

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/${tgMethod}`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalSize,
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { 
          const result = JSON.parse(raw);
          console.log('[webhook] Telegram ответ:', result.ok ? 'успех' : `ошибка: ${result.description}`);
          resolve(result); 
        } catch { 
          console.error('[webhook] Не удалось спарсить ответ Telegram:', raw);
          resolve({}); 
        }
      });
    });

    req.on('error', (err) => {
      console.error('[webhook] Ошибка при отправке в Telegram:', err.message);
      reject(err);
    });

    // Пишем header
    req.write(headerBuf);

    // Пишем файл STREAMING (не загружаем в память!)
    const stream = fs.createReadStream(filePath);
    stream.pipe(req, { end: false });

    stream.on('end', () => {
      // Когда файл закончился, пишем tail и завершаем запрос
      req.write(tailBuf);
      req.end();
    });

    stream.on('error', (err) => {
      console.error('[webhook] Ошибка чтения файла:', err.message);
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
    console.log(`[webhook] Новое сообщение от ${chatId}`);

    // ── /start ──
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

    // ── web_app_data ──
    if (msg.web_app_data?.data) {
      let data;
      try { data = JSON.parse(msg.web_app_data.data); }
      catch { 
        console.error('[webhook] Ошибка парсинга web_app_data');
        return res.status(200).json({ ok: true }); 
      }

      if (data.action !== 'send_video') {
        console.log('[webhook] Неизвестное действие:', data.action);
        return res.status(200).json({ ok: true }); 
      }

      console.log(`[webhook] Получена команда отправить видео: fileId=${data.fileId}, format=${data.format}`);

      // Сообщаем пользователю что получили
      await tgCall('sendMessage', {
        chat_id: chatId,
        text: '⏳ Видео получено, отправляю...',
      });

      // Скачиваем и отправляем в фоне
      setImmediate(async () => {
        try {
          console.log('[webhook] Начинаем отправку видео в Telegram...');
          const result = await sendVideoToUser(chatId, data.fileId, data.format || 'mp4', data.name || 'video.mp4');
          
          if (!result.ok) {
            const desc = result.description || 'неизвестная ошибка';
            console.error(`[webhook] Telegram вернул ошибку: ${desc}`);
            
            await tgCall('sendMessage', {
              chat_id: chatId,
              text: `❌ Не удалось отправить: ${desc}\n\nВозможно файл слишком большой (максимум 50 МБ для видео).`,
            });
          } else {
            console.log(`[webhook] Видео успешно отправлено пользователю ${chatId}`);
          }
        } catch (e) {
          console.error(`[webhook] Ошибка при отправке видео: ${e.message}`);
          await tgCall('sendMessage', {
            chat_id: chatId,
            text: `❌ Ошибка при отправке видео:\n\n${e.message}`,
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
