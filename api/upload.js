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

  const bb = busboy({ headers: req.headers, limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB
  const fileId = crypto.randomBytes(8).toString('hex');
  let filePath = '';
  let fileName = '';
  let fileSize = 0;

  bb.on('file', (name, file, info) => {
    fileName = info.filename || 'video.mp4';
    const ext = path.extname(fileName).toLowerCase() || '.mp4';
    filePath = path.join('/tmp', `${fileId}${ext}`);
    const ws = fs.createWriteStream(filePath);
    file.on('data', chunk => { fileSize += chunk.length; });
    file.pipe(ws);
    ws.on('error', (err) => {
      res.status(500).json({ error: 'Write error: ' + err.message });
    });
  });

  bb.on('finish', () => {
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'No file received' });
    }
    res.json({
      success: true,
      fileId,
      fileName,
      fileSize,
      filePath
    });
  });

  bb.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  req.pipe(bb);
}
