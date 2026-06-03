// api/upload.js — Принимает готовый файл из браузера и отправляет в Telegram
// Чистый ESM — никаких require(), работает на Vercel

export const config = {
  api: {
    bodyParser: false,
    // Vercel лимит на тело запроса — поднимаем до 4.5MB (максимум на Hobby)
    responseLimit: '10mb',
  },
};

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG = `https://api.telegram.org/bot${TOKEN}`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Читаем raw тело запроса (это multipart/form-data)
    const rawBody = await readBody(req);

    // Парсим multipart вручную — без busboy (нет нативных бинарей)
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) return res.status(400).json({ error: 'No boundary in Content-Type' });

    const boundary = boundaryMatch[1];
    const parts = parseMultipart(rawBody, boundary);

    const chatId = parts.fields['chat_id'];
    const format = parts.fields['format'] || 'mp4';
    const file = parts.files['file'];

    if (!file) return res.status(400).json({ error: 'No file received' });
    if (!chatId) return res.status(400).json({ error: 'No chat_id' });
    if (!TOKEN) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not set' });

    console.log(`[upload] file=${file.filename} size=${file.data.length} chatId=${chatId} format=${format}`);

    // Отправляем в Telegram
    const result = await sendToTelegram(chatId, file.data, file.filename, format);

    if (result.ok) {
      return res.status(200).json({ success: true, sent: true });
    } else {
      console.error('[upload] Telegram error:', result.description);
      return res.status(500).json({ error: 'Telegram: ' + (result.description || 'unknown error') });
    }

  } catch (err) {
    console.error('[upload] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ─── Читаем тело запроса в Buffer ─────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ─── Минимальный multipart парсер (без зависимостей) ──────────────────────────

function parseMultipart(body, boundary) {
  const fields = {};
  const files = {};

  // boundary как Buffer для бинарного поиска
  const sep = Buffer.from('--' + boundary);
  const CRLF = Buffer.from('\r\n');
  const CRLFCRLF = Buffer.from('\r\n\r\n');

  let pos = 0;

  // Найти все части
  while (pos < body.length) {
    // Ищем начало следующей части
    const sepIdx = indexOf(body, sep, pos);
    if (sepIdx === -1) break;

    pos = sepIdx + sep.length;

    // Конец multipart?
    if (body[pos] === 0x2D && body[pos + 1] === 0x2D) break; // '--'

    // Пропускаем CRLF после boundary
    if (body[pos] === 0x0D && body[pos + 1] === 0x0A) pos += 2;

    // Ищем конец заголовков (двойной CRLF)
    const headerEnd = indexOf(body, CRLFCRLF, pos);
    if (headerEnd === -1) break;

    const headerStr = body.slice(pos, headerEnd).toString('utf8');
    pos = headerEnd + 4; // пропускаем \r\n\r\n

    // Ищем конец данных этой части (следующий boundary)
    const nextSep = indexOf(body, Buffer.from('\r\n--' + boundary), pos);
    const dataEnd = nextSep === -1 ? body.length : nextSep;
    const data = body.slice(pos, dataEnd);

    pos = dataEnd;

    // Парсим Content-Disposition
    const cdMatch = headerStr.match(/Content-Disposition:[^\r\n]*name="([^"]+)"/i);
    if (!cdMatch) continue;
    const fieldName = cdMatch[1];

    const filenameMatch = headerStr.match(/filename="([^"]+)"/i);

    if (filenameMatch) {
      // Это файл
      files[fieldName] = {
        filename: filenameMatch[1],
        data: data,
      };
    } else {
      // Это обычное поле
      fields[fieldName] = data.toString('utf8');
    }
  }

  return { fields, files };
}

// indexOf для Buffer
function indexOf(buf, search, start = 0) {
  for (let i = start; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}

// ─── Отправка в Telegram через fetch (встроен в Node 18+) ─────────────────────

async function sendToTelegram(chatId, fileBuffer, filename, format) {
  const isGif = format === 'gif';
  const method = isGif ? 'sendAnimation' : 'sendDocument';
  const field  = isGif ? 'animation'     : 'document';

  const safeName = (filename || `video.${format}`).replace(/[^\w\-\.]/g, '_');

  // Собираем multipart вручную — fetch на Vercel не имеет FormData с файлами
  const boundary = 'TGBoundary' + Date.now();
  const before = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${field}"; filename="${safeName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const after = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([before, fileBuffer, after]);

  const r = await fetch(`${TG}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });

  return r.json();
}
