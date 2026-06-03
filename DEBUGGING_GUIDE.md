# 🔧 Справочник и Отладка Video Merger Bot

## 📚 Быстрый справочник команд

### Vercel CLI команды

```bash
# Установка
npm install -g vercel

# Вход в аккаунт
vercel login

# Развёртывание в production
vercel --prod

# Просмотр логов
vercel logs

# Просмотр логов последних N строк
vercel logs -n 50

# Просмотр функций
vercel list

# Информация о проекте
vercel projects

# Удалить проект
vercel remove PROJECT_NAME --confirm
```

### Git команды

```bash
# Инициализировать репозиторий
git init

# Добавить все файлы
git add .

# Создать коммит
git commit -m "сообщение"

# Отправить в GitHub
git push origin main

# Посмотреть статус
git status

# Посмотреть историю
git log
```

### cURL для тестирования API

```bash
# Проверить здоровье приложения
curl https://твой-домен.vercel.app/health

# Активировать вебхук
curl https://твой-домен.vercel.app/setup-webhook

# С дополнительной информацией
curl -v https://твой-домен.vercel.app/health

# Отправить JSON
curl -X POST https://твой-домен.vercel.app/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

---

## 🐛 Отладка проблем

### 1. Проверить, что бот получает сообщения

**Симптом:** Бот не отвечает на сообщения

**Шаги отладки:**

```bash
# 1. Проверить логи
vercel logs

# 2. Проверить здоровье приложения
curl https://твой-домен.vercel.app/health

# 3. Проверить конфигурацию вебхука на Telegram
TOKEN="твой_токен"
curl https://api.telegram.org/bot$TOKEN/getWebhookInfo

# Должно быть:
# "url": "https://твой-домен.vercel.app/webhook"
# "has_custom_certificate": false
# "pending_update_count": 0
```

### 2. Проверить, что видео загружается

**Симптом:** "Ошибка при загрузке видео"

**Шаги отладки:**

```bash
# 1. Посмотреть ошибки в логах
vercel logs

# 2. Проверить размер видео
# Максимум 500 MB

# 3. Проверить формат видео
ffmpeg -i твое_видео.mp4

# 4. Пересоздать бота (часто помогает)
# Нажми кнопку "Redeploy" на Vercel
```

### 3. Проверить обработку видео

**Симптом:** "Видео обрабатывается слишком долго"

**Шаги отладки:**

```bash
# 1. Посмотреть активные проекты
curl https://твой-домен.vercel.app/health

# Посмотри "processing_projects"

# 2. Проверить логи обработки
vercel logs

# 3. Если зависла обработка, пересоздай приложение
vercel --prod
```

---

## 🔍 Проверка переменных окружения

### Проверить, что переменные установлены

1. Зайди на https://vercel.com
2. Выбери проект `video-merger-bot`
3. Перейди на "Settings"
4. Нажми "Environment Variables"
5. Посмотри список переменных

### Что должно быть:

```
TELEGRAM_BOT_TOKEN = 123456789:ABCdefGHIjklmNOPqrSTUVwxyz
WEBHOOK_URL = https://video-merger-bot-abc123.vercel.app
```

### Если переменные не установлены:

1. Добавь их вручную
2. Нажми "Save"
3. Нажми "Redeploy" в разделе "Deployments"

---

## 📊 Мониторинг производительности

### Проверить использование ресурсов

```bash
# Развёрнутых функций
vercel list functions

# Логирование и статистика
vercel logs --follow

# Информация о проекте
vercel inspect
```

### На Vercel Dashboard

1. Зайди на https://vercel.com
2. Выбери проект
3. Перейди на "Analytics"
4. Посмотри:
   - Invocations (вызовы функций)
   - Duration (время выполнения)
   - CPU Time (время процессора)

---

## 🔐 Безопасность

### Проверить токен безопасности

```bash
# Убедиться, что токен не публичный
# Никогда не коммитай .env в GitHub!

# Проверить .gitignore
cat .gitignore

# Должна быть строка:
# .env
```

### Ротация токена (если скомпрометирован)

```bash
# 1. Зайди к BotFather в Telegram
# 2. Отправь /mybots
# 3. Выбери свого бота
# 4. Нажми "API Token"
# 5. Нажми "Regenerate token"
# 6. Обнови TELEGRAM_BOT_TOKEN на Vercel
# 7. Нажми "Redeploy"
```

---

## 🚀 Оптимизация

### Ускорить обработку видео

```bash
# Используй параметры в .env
FFMPEG_PRESET=fast  # fast, medium, slow
VIDEO_QUALITY=medium  # low, medium, high

# fast - быстрее, но хуже качество
# slow - медленнее, но лучше качество
```

### Увеличить лимиты Vercel

В `vercel.json` изменить:

```json
{
  "builds": [
    {
      "config": {
        "maxLambdaSize": "3000mb",  // Максимум 3000 MB
        "maxDuration": 900  // Максимум 15 минут
      }
    }
  ]
}
```

Потом:
```bash
git add vercel.json
git commit -m "Increase Vercel limits"
git push origin main
```

---

## 🆘 Экстренная помощь

### Если всё сломалось

```bash
# 1. Очистить кэш
npm cache clean --force

# 2. Переинициализировать Vercel
rm -rf .vercel
vercel

# 3. Пересоздать проект (если совсем плохо)
vercel remove PROJECT_NAME --confirm
# Потом создать новый проект
vercel --prod
```

### Если завис FFmpeg

```bash
# FFmpeg может зависнуть на обработке больших видео
# Решение:

# 1. Дождись 15 минут (максимальное время функции)
# 2. Функция остановится автоматически
# 3. Попробуй меньшее видео

# В коде это обрабатывается:
# maxDuration: 900 (15 минут)
```

---

## 📈 Рост и масштабирование

### Когда нужен upgrade

- Если бот используют 100+ пользователей
- Если обработка видео занимает >15 минут
- Если нужна сохранение истории проектов
- Если нужна реклама на боте

### Что добавить

1. **База данных** - PostgreSQL или MongoDB
   ```bash
   # Для сохранения истории проектов
   ```

2. **Очередь обработки** - Redis или RabbitMQ
   ```bash
   # Для обработки видео в очереди
   ```

3. **CDN** - для быстрой доставки видео
   ```bash
   # Для ускорения загрузок
   ```

4. **Система платежей** - Stripe, Yandex.Kassa
   ```bash
   # Для монетизации
   ```

---

## 📞 Полезные ссылки

| Ресурс | Ссылка |
|--------|--------|
| Telegram Bot API | https://core.telegram.org/bots/api |
| Telegram Bot Commands | https://core.telegram.org/bots/commands |
| Vercel Documentation | https://vercel.com/docs |
| FastAPI Guide | https://fastapi.tiangolo.com |
| FFmpeg Wiki | https://trac.ffmpeg.org/wiki |
| Python asyncio | https://docs.python.org/3/library/asyncio.html |

---

## 🎓 Обучающие материалы

### Как работает бот

1. Пользователь отправляет сообщение в Telegram
2. Telegram отправляет вебхук на твой сервер (Vercel)
3. Vercel запускает функцию `api_handler_full.py`
4. Функция обрабатывает запрос и отправляет ответ
5. Ответ отправляется обратно в Telegram
6. Пользователь видит ответ в чате

### Как работает видео обработка

1. Пользователь загружает видео в Telegram
2. Telegram сохраняет видео на своих серверах
3. Бот просит Telegram скачать видео
4. Видео скачивается на Vercel сервер
5. FFmpeg обрабатывает видео (объединение, переходы и т.д.)
6. Готовое видео отправляется обратно в Telegram
7. Телеграм сохраняет видео и отправляет пользователю

---

## ✅ Чек-лист перед запуском

- [ ] Создан аккаунт на GitHub
- [ ] Создан аккаунт на Vercel
- [ ] Получен токен от BotFather
- [ ] Код загружен в GitHub
- [ ] Создан .env файл с переменными
- [ ] Проект развернут на Vercel
- [ ] WEBHOOK_URL обновлён в переменных
- [ ] Вебхук активирован (/setup-webhook)
- [ ] Бот отвечает на /start
- [ ] Бот принимает видео файлы
- [ ] Тестовое видео успешно обработано

---

**Удачи с отладкой! 🎯**

Если что-то не работает - сначала посмотри логи!
```bash
vercel logs
```
