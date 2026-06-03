// api/download.js — Отдача готового файла
const fs = require('fs');
const path = require('path');

export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { outId, format = 'mp4', name = 'video' } = req.query;
  if (!outId) return res.status(400).json({ error: 'outId required' });

  console.log(`[download] Запрос файла: outId=${outId}, format=${format}`);

  const ext = format === 'gif' ? 'gif' : format === 'webm' ? 'webm' : format === 'mov' ? 'mov' : 'mp4';
  const filePath = path.join('/tmp', `${outId}.${ext}`);
  
  console.log(`[download] Ищем файл: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error(`[download] Файл не найден: ${filePath}`);
    
    const tmpDir = '/tmp';
    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(outId));
    console.log(`[download] Файлы с ID ${outId}: ${files.join(', ')}`);
    
    return res.status(404).json({ error: 'File not found or expired', searched: filePath, available: files });
  }

  const stat = fs.statSync(filePath);
  const mimeMap = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    gif: 'image/gif'
  };

  console.log(`[download] Отправляем файл: ${filePath} (${stat.size} байт)`);

  res.setHeader('Content-Type', mimeMap[ext] || 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${name}_cut.${ext}"`);
  res.setHeader('Accept-Ranges', 'bytes');

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  
  stream.on('error', (err) => {
    console.error(`[download] Ошибка чтения файла: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Read error' });
    }
  });

  res.on('error', (err) => {
    console.error(`[download] Ошибка при отправке: ${err.message}`);
  });
}
