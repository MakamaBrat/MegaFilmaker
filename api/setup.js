// api/setup.js — Регистрация webhook (открыть 1 раз в браузере)
// GET /api/setup?secret=ВАШ_СЕКРЕТ

export default async function handler(req, res) {
  const secret = process.env.SETUP_SECRET || 'changeme';
  if (req.query.secret !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL || `https://${process.env.VERCEL_URL}`;
  const webhookUrl = `${appUrl}/api/webhook`;

  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message'],
    }),
  });

  const data = await r.json();
  return res.json({ webhookUrl, telegram: data });
}
