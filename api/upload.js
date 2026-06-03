// api/upload.js — Загрузка файла на временное хранилище (Vercel /tmp)
const busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const bb = busboy({ 
    headers: req.headers, 
    limits: { fileSize: 200 * 1024 * 1024 } // 200MB
  });
  
  const fileId = crypto.randomBytes(8).toString('hex');
  let filePath = '';
  let fileName = '';
  let fileSize = 0;
  let fileReceived = false;

  bb.on('file', (name, file, info) => {
    console.log(`[upload] Получен файл: ${info.filename}, поле: ${name}`);
    
    fileReceived = true;
    fileName = info.filename || 'video.mp4';
    const ext = path.extname(fileName).toLowerCase() || '.mp4';
    filePath = path.join('/tmp', `${fileId}${ext}`);
    
    console.log(`[upload] Сохраняем как: ${filePath}`);
    
    const ws = fs.createWriteStream(filePath);
    
    file.on('data', chunk => { 
      fileSize += chunk.length; 
    });
    
    file.on('error', (err) => {
      console.error(`[upload] Ошибка потока файла: ${err.message}`);
      ws.destroy();
      fs.unlink(filePath, () => {});
      if (!res.headersSent) {
        res.status(500).json({ error: 'File stream error: ' + err.message });
      }
    });
    
    file.pipe(ws);
    
    ws.on('error', (err) => {
      console.error(`[upload] Ошибка записи файла: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Write error: ' + err.message });
      }
    });
    
    ws.on('finish', () => {
      console.log(`[upload] Файл успешно сохранен: ${filePath} (${fileSize} байт)`);
    });
  });

  bb.on('finish', () => {
    console.log(`[upload] Busboy finished, fileReceived=${fileReceived}, filePath=${filePath}`);
    
    if (!fileReceived || !filePath || !fs.existsSync(filePath)) {
      console.error('[upload] Файл не был получен или не существует');
      if (!res.headersSent) {
        return res.status(400).json({ error: 'No file received' });
      }
    } else {
      const stat = fs.statSync(filePath);
      console.log(`[upload] Отправляем ответ с fileId=${fileId}`);
      
      if (!res.headersSent) {
        res.json({
          success: true,
          fileId,
          fileName,
          fileSize: stat.size,
          filePath
        });
      }
    }
  });

  bb.on('error', (err) => {
    console.error('[upload] Busboy error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  });

  req.on('error', (err) => {
    console.error('[upload] Request error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Request error: ' + err.message });
    }
  });

  req.pipe(bb);
}
