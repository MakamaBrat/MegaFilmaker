# ВидеоРез — Telegram Mini App

Полноценный видеорезак как Telegram Mini App, деплоится на Vercel за 3 минуты.

## Стек
- **Фронтенд**: чистый HTML/CSS/JS (никаких фреймворков, быстрый старт)
- **Бэкенд**: Vercel Serverless Functions (Node.js)
- **Обработка видео**: FFmpeg через `@ffmpeg-installer/ffmpeg`

## Возможности
- ✂️ Обрезка видео по таймлайну с превью кадров
- 🔄 Поворот / отражение
- ⚡ Изменение скорости (0.5× — 2×)
- 📦 Выбор формата (MP4, WEBM, MOV, GIF) и качества
- ⇄ Инверсия — вырезать фрагмент (оставить начало и конец)
- 📱 Telegram Mini App ready

## Деплой на Vercel

### 1. Установить Vercel CLI
```bash
npm i -g vercel
```

### 2. Задеплоить
```bash
cd videocutter-vercel
npm install
vercel --prod
```

### 3. Получить URL
После деплоя получишь URL вида: `https://your-app.vercel.app`

### 4. Настроить Telegram бота
1. Открой [@BotFather](https://t.me/BotFather)
2. Команда `/newbot` — создай бота
3. Команда `/newapp` — создай Mini App
4. URL Web App: `https://your-app.vercel.app`
5. Готово!

## Ограничения Vercel Free Plan
- Функции: макс. 10 сек на запрос (нужен Pro для 5 мин)
- Память: 1024MB для upload, 3008MB для process
- /tmp: ~500MB

### Для длинных видео рекомендуется Vercel Pro
Или задеплоить бэкенд на Railway/Render где нет лимита по времени.

## Структура
```
├── api/
│   ├── upload.js    — загрузка файла
│   ├── process.js   — FFmpeg обработка
│   ├── download.js  — отдача файла
│   └── info.js      — метаданные видео
├── public/
│   └── index.html   — фронтенд
├── vercel.json
└── package.json
```
