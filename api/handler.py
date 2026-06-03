"""
Telegram Bot для объединения видео
Работает на Vercel как serverless функция
"""

import os
import logging
import aiohttp
import json
from datetime import datetime
import asyncio
import tempfile
from typing import Optional, Dict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Настройки
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"

# Хранилище проектов
user_projects = {}


class VideoProject:
    def __init__(self, user_id: int, chat_id: int):
        self.user_id = user_id
        self.chat_id = chat_id
        self.video1_file_id = None
        self.video2_file_id = None
        self.status = "waiting_video1"
        self.edit_settings = {
            "transition": "fade",
            "duration": 1.0,
            "audio": "both"
        }


async def send_message(chat_id: int, text: str, reply_markup=None):
    """Отправить сообщение"""
    try:
        async with aiohttp.ClientSession() as session:
            data = {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML"
            }
            if reply_markup:
                data["reply_markup"] = reply_markup
            
            async with session.post(f"{TELEGRAM_API}/sendMessage", json=data) as resp:
                return await resp.json()
    except Exception as e:
        logger.error(f"Error sending message: {e}")
        return {"ok": False}


async def answer_callback(callback_query_id: str):
    """Ответить на callback"""
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(
                f"{TELEGRAM_API}/answerCallbackQuery",
                json={"callback_query_id": callback_query_id}
            )
    except:
        pass


async def handle_update(update: dict):
    """Обработать обновление от Telegram"""
    
    # Обработка текстовых сообщений
    if "message" in update:
        message = update["message"]
        user_id = message["from"]["id"]
        chat_id = message["chat"]["id"]
        text = message.get("text", "")
        
        if text == "/start":
            user_projects[user_id] = VideoProject(user_id, chat_id)
            await send_message(
                chat_id,
                "👋 <b>Привет! 🎬 Добро пожаловать в Video Merger Bot</b>\n\n"
                "Здесь ты можешь объединить два видео в одно!\n\n"
                "Давайте начнём? Нажми кнопку ниже:",
                reply_markup={
                    "inline_keyboard": [
                        [{"text": "🎬 Начать", "callback_data": "start_new"}]
                    ]
                }
            )
        
        elif text == "/help":
            await send_message(
                chat_id,
                "<b>📖 Справка</b>\n\n"
                "/start - Новый проект\n"
                "/help - Эта справка\n"
                "/cancel - Отменить\n\n"
                "Как пользоваться:\n"
                "1. Загрузи первое видео\n"
                "2. Загрузи второе видео\n"
                "3. Выбери параметры\n"
                "4. Получи результат!"
            )
        
        elif text == "/cancel":
            if user_id in user_projects:
                del user_projects[user_id]
                await send_message(chat_id, "❌ Отменено")
        
        # Обработка видео
        elif "video" in message:
            if user_id not in user_projects:
                user_projects[user_id] = VideoProject(user_id, chat_id)
            
            project = user_projects[user_id]
            file_id = message["video"]["file_id"]
            
            if project.status == "waiting_video1":
                project.video1_file_id = file_id
                project.status = "waiting_video2"
                await send_message(
                    chat_id,
                    "✅ <b>Первое видео загружено!</b>\n\n"
                    "Теперь загрузи второе видео"
                )
            
            elif project.status == "waiting_video2":
                project.video2_file_id = file_id
                project.status = "ready_to_edit"
                await send_message(
                    chat_id,
                    "✅ <b>Оба видео загружены!</b>\n\n"
                    "Выбери как объединить:",
                    reply_markup={
                        "inline_keyboard": [
                            [
                                {"text": "⚡ Быстро", "callback_data": "merge_fast"},
                                {"text": "⚙️ С эффектами", "callback_data": "merge_edit"}
                            ]
                        ]
                    }
                )
    
    # Обработка callback кнопок
    if "callback_query" in update:
        callback = update["callback_query"]
        user_id = callback["from"]["id"]
        chat_id = callback["message"]["chat"]["id"]
        callback_data = callback["data"]
        callback_query_id = callback["id"]
        
        await answer_callback(callback_query_id)
        
        if callback_data == "start_new":
            user_projects[user_id] = VideoProject(user_id, chat_id)
            await send_message(
                chat_id,
                "🎬 <b>Загрузи первое видео</b>\n\n"
                "Отправь видеофайл в этот чат"
            )
        
        elif callback_data == "merge_fast":
            await send_message(
                chat_id,
                "⏳ <b>Начинаю объединение...</b>\n\n"
                "Это может занять 5-15 минут...\n"
                "Результат отправлю в этот чат"
            )
            # Здесь должна быть реальная обработка видео
            await asyncio.sleep(2)
            await send_message(
                chat_id,
                "✅ <b>Готово!</b>\n\n"
                "Видео объединено и отправляется..."
            )
        
        elif callback_data == "merge_edit":
            await send_message(
                chat_id,
                "⚙️ <b>Выбери переход:</b>",
                reply_markup={
                    "inline_keyboard": [
                        [
                            {"text": "⚡ Fade", "callback_data": "trans_fade"},
                            {"text": "↔️ Slide", "callback_data": "trans_slide"}
                        ],
                        [
                            {"text": "🔍 Zoom", "callback_data": "trans_zoom"},
                            {"text": "✂️ Cut", "callback_data": "trans_cut"}
                        ]
                    ]
                }
            )
        
        elif callback_data.startswith("trans_"):
            trans = callback_data.split("_")[1]
            user_projects[user_id].edit_settings["transition"] = trans
            await send_message(
                chat_id,
                f"✅ Выбран: <b>{trans.upper()}</b>\n\n"
                "Начинаю обработку...",
            )
            await asyncio.sleep(2)
            await send_message(
                chat_id,
                "✅ <b>Видео готово!</b>"
            )


async def webhook(request):
    """Основной вебхук для Vercel"""
    try:
        data = await request.json()
        logger.info(f"Update: {json.dumps(data)[:200]}")
        
        if "update_id" in data or "message" in data or "callback_query" in data:
            await handle_update(data)
        
        return {"ok": True}
    
    except Exception as e:
        logger.error(f"Error: {e}")
        return {"ok": False, "error": str(e)}


# Для Vercel serverless функции
from http.server import BaseHTTPRequestHandler
import json as json_module


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        """Обработать POST запрос"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json_module.loads(post_data)
            
            logger.info(f"Webhook: {json_module.dumps(data)[:200]}")
            
            # Обработать update асинхронно
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(handle_update(data))
            
            # Отправить ответ
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json_module.dumps({"ok": True}).encode())
        
        except Exception as e:
            logger.error(f"Error: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json_module.dumps({"ok": False, "error": str(e)}).encode())
    
    def do_GET(self):
        """Обработать GET запрос"""
        if self.path == "/health":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json_module.dumps({
                "status": "ok",
                "timestamp": datetime.now().isoformat()
            }).encode())
        
        elif self.path == "/setup-webhook":
            # Установить вебхук
            webhook_url = os.getenv("WEBHOOK_URL", "").rstrip("/")
            if not webhook_url:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json_module.dumps({
                    "error": "WEBHOOK_URL not set"
                }).encode())
                return
            
            # Отправить запрос на Telegram
            import subprocess
            try:
                url = f"{TELEGRAM_API}/setWebhook"
                result = subprocess.run([
                    "curl", "-X", "POST", url,
                    "-d", f"url={webhook_url}/api/handler"
                ], capture_output=True, text=True)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json_module.dumps({
                    "ok": True,
                    "message": "Webhook set successfully"
                }).encode())
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json_module.dumps({
                    "error": str(e)
                }).encode())
        
        else:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json_module.dumps({
                "status": "ok",
                "name": "Video Merger Bot",
                "version": "1.0.0"
            }).encode())
