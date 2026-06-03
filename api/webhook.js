// api/webhook.js — ПРОСТАЯ ДИАГНОСТИЧЕСКАЯ ВЕРСИЯ
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
        return res.status(200).json({ ok: true }); 
      }

      if (data.action !== 'send_video') {
        return res.status(200).json({ ok: true }); 
      }

      const { fileId, format = 'mp4', name = 'video' } = data;
      
      console.log(`\n========== НАЧАЛО ОТПРАВКИ ==========`);
      console.log(`fileId: ${fileId}`);
      console.log(`format: ${format}`);
      console.log(`name: ${name}`);

      // ДИАГНОСТИКА: Проверяем какие файлы есть в /tmp
      const tmpDir = '/tmp';
      let allFiles = [];
      try {
        allFiles = fs.readdirSync(tmpDir);
      } catch (e) {
        console.error(`Ошибка чтения /tmp: ${e.message}`);
      }

      const ourFiles = allFiles.filter(f => f.startsWith(fileId));
      console.log(`\nВсе файлы с ID ${fileId}: ${ourFiles.length > 0 ? ourFiles.join(', ') : 'НЕТУ!'}`);
      console.log(`Всего файлов в /tmp: ${allFiles.length}`);

      // Сообщаем пользователю
      await tgCall('sendMessage', {
        chat_id: chatId,
        text: '⏳ Проверяю видео...',
      });

      const ext = format === 'gif' ? 'gif' : format === 'webm' ? 'webm' : format === 'mov' ? 'mov' : 'mp4';
      const filePath = path.join(tmpDir, `${fileId}.${ext}`);

      console.log(`\nЩу файл: ${filePath}`);

      // ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ ФАЙЛА
      if (!fs.existsSync(filePath)) {
        console.error(`ОШИБКА: Файл не найден!`);
        console.log(`Найденные файлы: ${ourFiles.join(', ') || 'НИЧЕГО!'}`);
        
        let errorMsg = `❌ ОШИБКА: Файл не найден в /tmp!\n\n`;
        errorMsg += `Ожидаемый файл: ${filePath}\n\n`;
        if (ourFiles.length > 0) {
          errorMsg += `Найденные файлы:\n${ourFiles.map(f => `• ${f}`).join('\n')}\n\n`;
        } else {
          errorMsg += `В /tmp нет файлов с ID ${fileId}\n\n`;
        }
        errorMsg += `Возможная причина:\n`;
        errorMsg += `• Файл не был загружен на сервер\n`;
        errorMsg += `• Vercel удалил /tmp после завершения\n`;
        errorMsg += `• Ошибка при загрузке`;

        await tgCall('sendMessage', {
          chat_id: chatId,
          text: errorMsg,
        });

        console.log(`========== КОНЕЦ (ОШИБКА) ==========\n`);
        return res.status(200).json({ ok: true });
      }

      const stat = fs.statSync(filePath);
      console.log(`✓ Файл найден! Размер: ${stat.size} байт (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

      // ОТПРАВЛЯЕМ ФАЙЛ ПРЯМЫМ СПОСОБОМ (без multipart)
      // Используем fs.readFile чтобы прочитать весь файл в буфер
      const fileBuffer = fs.readFileSync(filePath);
      console.log(`✓ Файл прочитан в памяти`);

      // СТРОИМ ПРОСТОЙ MULTIPART
      const boundary = '----FormBoundary' + Date.now();
      const filename = name.replace(/[^\w\-\.]/g, '_');
      
      const beforeFile =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="chat_id"\r\n\r\n` +
        `${chatId}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="document"; filename="${filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`;

      const afterFile = `\r\n--${boundary}--\r\n`;

      const body = Buffer.concat([
        Buffer.from(beforeFile),
        fileBuffer,
        Buffer.from(afterFile),
      ]);

      console.log(`Размер запроса: ${body.length} байт (${(body.length / 1024 / 1024).toFixed(2)} MB)`);

      // ОТПРАВЛЯЕМ В TELEGRAM
      const tgReq = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${TOKEN}/sendDocument`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      }, tgRes => {
        console.log(`Ответ Telegram: HTTP ${tgRes.statusCode}`);
        
        let rawData = '';
        tgRes.on('data', chunk => rawData += chunk);
        tgRes.on('end', async () => {
          try {
            const result = JSON.parse(rawData);
            console.log(`Telegram OK: ${result.ok}`);
            
            if (result.ok) {
              console.log(`✓ УСПЕХ!`);
              await tgCall('sendMessage', {
                chat_id: chatId,
                text: '✅ Видео отправлено!',
              });
            } else {
              console.error(`✗ Ошибка Telegram: ${result.description}`);
              await tgCall('sendMessage', {
                chat_id: chatId,
                text: `❌ Ошибка Telegram:\n${result.description}`,
              });
            }
          } catch (e) {
            console.error(`Ошибка парсинга: ${e.message}`);
          }
          console.log(`========== КОНЕЦ ==========\n`);
        });
      });

      tgReq.on('error', async (err) => {
        console.error(`ОШИБКА HTTPS: ${err.message}`);
        await tgCall('sendMessage', {
          chat_id: chatId,
          text: `❌ Ошибка сети:\n${err.message}`,
        });
        console.log(`========== КОНЕЦ (ОШИБКА) ==========\n`);
      });

      tgReq.write(body);
      tgReq.end();

      return res.status(200).json({ ok: true });
    }

  } catch (e) {
    console.error('[webhook] Критическая ошибка:', e.message);
  }

  return res.status(200).json({ ok: true });
}
