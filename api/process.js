// api/process.js — Обработка видео через FFmpeg
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

ffmpeg.setFfmpegPath(ffmpegPath);

export const config = { api: { bodyParser: true } };

function buildFilters(opts) {
  const { rotation, flipH, flipV, speed } = opts;
  let vf = [];
  let af = '';

  if (rotation === 90) vf.push('transpose=1');
  else if (rotation === 180) vf.push('transpose=2,transpose=2');
  else if (rotation === 270) vf.push('transpose=2');
  if (flipH) vf.push('hflip');
  if (flipV) vf.push('vflip');
  if (speed && speed !== 1) {
    vf.push(`setpts=${(1 / speed).toFixed(3)}*PTS`);
    const s = parseFloat(speed);
    if (s === 2) af = 'atempo=2.0';
    else if (s === 1.5) af = 'atempo=1.5';
    else if (s === 0.75) af = 'atempo=0.75';
    else if (s === 0.5) af = 'atempo=0.5';
  }
  return { vf, af };
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    fileId,
    startTime = 0,
    endTime,
    rotation = 0,
    flipH = false,
    flipV = false,
    speed = 1,
    format = 'mp4',
    quality = 'medium',
    invert = false
  } = req.body;

  if (!fileId) return res.status(400).json({ error: 'fileId required' });

  // Find input file
  const tmpFiles = fs.readdirSync('/tmp').filter(f => f.startsWith(fileId));
  if (!tmpFiles.length) return res.status(404).json({ error: 'File not found. Please upload again.' });
  const inputPath = path.join('/tmp', tmpFiles[0]);

  const outId = crypto.randomBytes(8).toString('hex');
  const ext = format === 'gif' ? 'gif' : format === 'webm' ? 'webm' : format === 'mov' ? 'mov' : 'mp4';
  const outputPath = path.join('/tmp', `${outId}.${ext}`);

  const crfMap = { low: '35', medium: '23', high: '18' };
  const crf = crfMap[quality] || '23';
  const { vf, af } = buildFilters({ rotation, flipH, flipV, speed });

  const duration = parseFloat(endTime) - parseFloat(startTime);

  let cmd = ffmpeg(inputPath);

  if (!invert) {
    cmd = cmd.seekInput(parseFloat(startTime)).duration(duration);
  }

  if (vf.length > 0) cmd = cmd.videoFilters(vf.join(','));
  if (af) cmd = cmd.audioFilters(af);

  if (format === 'gif') {
    cmd = cmd
      .fps(10)
      .size('480x?')
      .noAudio()
      .format('gif');
  } else if (format === 'webm') {
    cmd = cmd
      .videoCodec('libvpx-vp9')
      .audioCodec('libopus')
      .outputOptions(['-crf', crf, '-b:v', '0'])
      .format('webm');
  } else {
    cmd = cmd
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-crf', crf,
        '-preset', 'fast',
        '-b:a', '128k',
        '-movflags', '+faststart'
      ])
      .format(format === 'mov' ? 'mov' : 'mp4');
  }

  cmd
    .output(outputPath)
    .on('end', () => {
      if (!fs.existsSync(outputPath)) {
        return res.status(500).json({ error: 'Output file not created' });
      }
      const stat = fs.statSync(outputPath);
      res.json({
        success: true,
        outId,
        format: ext,
        fileSize: stat.size,
        outputPath
      });
    })
    .on('error', (err) => {
      console.error('FFmpeg error:', err.message);
      res.status(500).json({ error: 'Processing failed: ' + err.message });
    })
    .run();
}
