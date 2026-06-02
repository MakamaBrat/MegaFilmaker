// api/download.js — Отдача готового файла
const fs = require('fs');
const path = require('path');

export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { outId, format = 'mp4', name = 'video' } = req.query;
  if (!outId) return res.status(400).json({ error: 'outId required' });

  const filePath = path.join('/tmp', `${outId}.${format}`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found or expired' });
  }

  const stat = fs.statSync(filePath);
  const mimeMap = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    gif: 'image/gif'
  };

  res.setHeader('Content-Type', mimeMap[format] || 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${name}_cut.${format}"`);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', () => res.status(500).end());
}
