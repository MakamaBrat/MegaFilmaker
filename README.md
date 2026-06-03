# 🤖 Video Merger Telegram Bot

Telegram бот для объединения видео, работающий на **Vercel**.

## 🚀 Быстрый старт (5 минут)

### 1. Получить токен бота
- Открыть Telegram
- Найти **@BotFather**
- Отправить `/newbot`
- Выбрать имя и username
- Скопировать **ТОКЕН**

### 2. Создать .env файл
```bash
cp .env.example .env
```

Открыть `.env` и заменить:
```
TELEGRAM_BOT_TOKEN=твой_токен_здесь
WEBHOOK_URL=https://твой-домен.vercel.app
```

### 3. Загрузить на GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ТВ_ИМЕНИЕ/video-merger-bot
git push -u origin main
```

### 4. Развернуть на Vercel
1. Зайди на **https://vercel.com**
2. Импортируй репозиторий с GitHub
3. Добавь переменные окружения:
   - `TELEGRAM_BOT_TOKEN` = твой токен
   - `WEBHOOK_URL` = домен Vercel (узнаешь после Deploy)
4. Нажми **Deploy**

### 5. Активировать вебхук
После того как Vercel развернул приложение, открыть:
```
https://твой-домен.vercel.app/setup-webhook
```

Должно вывести:
```json
{"ok": true, "message": "Webhook set successfully"}
```

### 6. Тестировать
Найти бота в Telegram и отправить `/start`

---

## 📁 Структура файлов

```
video-merger-bot/
├── api/
│   └── handler.py          # Основной бот
├── vercel.json             # Конфигурация
├── requirements.txt        # Зависимости
├── .env.example            # Пример переменных
└── .gitignore             # Что не коммитить
```

---

## 🔧 Команды бота

- `/start` - Начать новый проект
- `/help` - Справка
- `/cancel` - Отменить

---

## ❓ Если Vercel не видит приложение

1. Проверить, что файл находится в `api/handler.py`
2. Проверить `vercel.json` конфигурацию
3. Убедиться, что `requirements.txt` заполнен
4. Нажать "Redeploy" на Vercel

---

## 📞 Команды для проверки

```bash
# Посмотреть логи Vercel
vercel logs

# Проверить статус
curl https://твой-домен.vercel.app/health

# Активировать вебхук вручную
curl https://твой-домен.vercel.app/setup-webhook
```

---

**Готово! Бот работает! 🎉**
