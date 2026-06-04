// api/info.js — Получить метаданные видео
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegPath);

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: 'fileId required' });

  const tmpFiles = fs.readdirSync('/tmp').filter(f => f.startsWith(fileId));
  if (!tmpFiles.length) return res.status(404).json({ error: 'File not found' });
  const filePath = path.join('/tmp', tmpFiles[0]);

  ffmpeg.ffprobe(filePath, (err, metadata) => {
    if (err) return res.status(500).json({ error: err.message });
    const video = metadata.streams.find(s => s.codec_type === 'video');
    const audio = metadata.streams.find(s => s.codec_type === 'audio');
    res.json({
      duration: metadata.format.duration,
      size: metadata.format.size,
      width: video?.width,
      height: video?.height,
      fps: video ? eval(video.r_frame_rate) : null,
      hasAudio: !!audio,
      format: metadata.format.format_name
    });
  });
}
