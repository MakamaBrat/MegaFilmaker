"""
Расширенный обработчик API Telegram бота с функциями обработки видео
"""

import os
import sys
import logging
import json
import hashlib
import asyncio
from pathlib import Path
from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import JSONResponse
import aiohttp
from datetime import datetime
from typing import Dict, Optional
import tempfile

# Импортируем модуль обработки видео
sys.path.insert(0, os.path.dirname(__file__))
try:
    from video_processor import VideoProcessor
except ImportError:
    VideoProcessor = None

# Логирование
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Настройки
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
WEBHOOK_URL = os.getenv("WEBHOOK_URL")
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"

# Хранилище проектов в памяти
user_projects = {}
download_cache = {}  # Кэш для загруженных файлов


class VideoProject:
    """Класс для хранения информации о проекте редактирования видео"""
    
    def __init__(self, user_id: int, chat_id: int):
        self.user_id = user_id
        self.chat_id = chat_id
        self.video1_file_id = None
        self.video2_file_id = None
        self.video1_path = None
        self.video2_path = None
        self.output_path = None
        self.status = "waiting_video1"
        self.created_at = datetime.now()
        self.edit_settings = {
            "transition": "fade",
            "duration": 1.0,
            "audio": "both"
        }
        self.processing = False
    
    def to_dict(self):
        return {
            "video1_file_id": self.video1_file_id,
            "video2_file_id": self.video2_file_id,
            "status": self.status,
            "edit_settings": self.edit_settings,
            "processing": self.processing
        }


async def send_message(chat_id: int, text: str, reply_markup=None, disable_web_page_preview: bool = True):
    """Отправить текстовое сообщение в Telegram"""
    url = f"{TELEGRAM_API}/sendMessage"
    data = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": disable_web_page_preview
    }
    if reply_markup:
        data["reply_markup"] = reply_markup
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=data) as response:
                return await response.json()
    except Exception as e:
        logger.error(f"Error sending message: {e}")
        return {"ok": False, "error": str(e)}


async def send_video(chat_id: int, video_path: str, caption: str = ""):
    """Отправить видео в Telegram"""
    url = f"{TELEGRAM_API}/sendVideo"
    
    try:
        async with aiohttp.ClientSession() as session:
            with open(video_path, 'rb') as video_file:
                data = aiohttp.FormData()
                data.add_field('chat_id', str(chat_id))
                data.add_field('video', video_file, filename=os.path.basename(video_path))
                if caption:
                    data.add_field('caption', caption)
                data.add_field('parse_mode', 'HTML')
                
                async with session.post(url, data=data, timeout=aiohttp.ClientTimeout(total=600)) as response:
                    return await response.json()
    except Exception as e:
        logger.error(f"Error sending video: {e}")
        return {"ok": False, "error": str(e)}


async def send_document(chat_id: int, file_path: str, caption: str = ""):
    """Отправить документ (видео как файл) в Telegram"""
    url = f"{TELEGRAM_API}/sendDocument"
    
    try:
        async with aiohttp.ClientSession() as session:
            with open(file_path, 'rb') as file:
                data = aiohttp.FormData()
                data.add_field('chat_id', str(chat_id))
                data.add_field('document', file, filename=os.path.basename(file_path))
                if caption:
                    data.add_field('caption', caption)
                data.add_field('parse_mode', 'HTML')
                
                async with session.post(url, data=data, timeout=aiohttp.ClientTimeout(total=600)) as response:
                    return await response.json()
    except Exception as e:
        logger.error(f"Error sending document: {e}")
        return {"ok": False, "error": str(e)}


async def download_file_from_telegram(file_id: str) -> Optional[str]:
    """Загрузить файл видео с серверов Telegram"""
    try:
        # Получить информацию о файле
        url = f"{TELEGRAM_API}/getFile?file_id={file_id}"
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                data = await response.json()
                
                if not data.get('ok'):
                    logger.error("Failed to get file info from Telegram")
                    return None
                
                file_path = data['result']['file_path']
                file_size = data['result'].get('file_size', 0)
                
                # Загрузить файл
                download_url = f"https://api.telegram.org/file/bot{TELEGRAM_TOKEN}/{file_path}"
                
                # Создать временный файл
                temp_dir = tempfile.gettempdir()
                local_file = os.path.join(temp_dir, f"tg_video_{file_id}.mp4")
                
                # Загрузить файл
                async with session.get(download_url) as response:
                    with open(local_file, 'wb') as f:
                        f.write(await response.read())
                
                logger.info(f"Downloaded file: {local_file} (size: {file_size} bytes)")
                return local_file
    
    except Exception as e:
        logger.error(f"Error downloading file from Telegram: {e}")
        return None


async def process_and_merge_videos(user_id: int, chat_id: int, background_tasks: BackgroundTasks):
    """Обработать и объединить видео в фоне"""
    
    if user_id not in user_projects:
        await send_message(chat_id, "❌ Проект не найден")
        return
    
    project = user_projects[user_id]
    project.processing = True
    
    try:
        # Уведомить о начале обработки
        status_msg = await send_message(
            chat_id,
            "⏳ <b>Начинаю обработку видео...</b>\n"
            "Загружаю видео с серверов Telegram\n"
            "Это может занять несколько минут в зависимости от размера файлов..."
        )
        
        # Загрузить видео с Telegram
        logger.info(f"Downloading video 1: {project.video1_file_id}")
        video1_path = await download_file_from_telegram(project.video1_file_id)
        
        if not video1_path:
            await send_message(chat_id, "❌ Ошибка при загрузке первого видео")
            project.processing = False
            return
        
        project.video1_path = video1_path
        
        logger.info(f"Downloading video 2: {project.video2_file_id}")
        video2_path = await download_file_from_telegram(project.video2_file_id)
        
        if not video2_path:
            await send_message(chat_id, "❌ Ошибка при загрузке второго видео")
            project.processing = False
            return
        
        project.video2_path = video2_path
        
        # Обновить статус
        await send_message(
            chat_id,
            "✅ Видео загружены\n"
            "⏳ Начинаю объединение...\n"
            f"Переход: <b>{project.edit_settings['transition']}</b>\n"
            f"Длительность: <b>{project.edit_settings['duration']} сек</b>"
        )
        
        # Создать путь для выходного файла
        output_dir = tempfile.gettempdir()
        output_file = os.path.join(output_dir, f"merged_{user_id}_{datetime.now().timestamp()}.mp4")
        project.output_path = output_file
        
        # Объединить видео
        if VideoProcessor:
            logger.info("Starting video merge process")
            success = await VideoProcessor.merge_videos(
                video1_path,
                video2_path,
                output_file,
                transition=project.edit_settings["transition"],
                transition_duration=project.edit_settings["duration"],
                audio_mode=project.edit_settings["audio"]
            )
            
            if success and os.path.exists(output_file):
                file_size = os.path.getsize(output_file)
                size_mb = file_size / (1024 * 1024)
                
                # Отправить готовое видео
                await send_message(
                    chat_id,
                    f"✅ <b>Видео готово!</b>\n"
                    f"Размер: <b>{size_mb:.2f} MB</b>\n"
                    f"Отправляю тебе..."
                )
                
                # Отправить видео в Telegram
                result = await send_video(
                    chat_id,
                    output_file,
                    "🎬 Вот твое объединённое видео!\n\n"
                    f"Переход: {project.edit_settings['transition']}\n"
                    f"Длительность переходов: {project.edit_settings['duration']} сек"
                )
                
                if result.get('ok'):
                    await send_message(
                        chat_id,
                        "🎉 <b>Успешно!</b>\n"
                        "Видео отправлено в Telegram.\n\n"
                        "Хочешь создать ещё один проект?",
                        reply_markup={
                            "inline_keyboard": [
                                [{"text": "➕ Новый проект", "callback_data": "new_project"}],
                                [{"text": "📖 Справка", "callback_data": "help_info"}]
                            ]
                        }
                    )
                else:
                    await send_message(
                        chat_id,
                        "⚠️ Видео было обработано, но не удалось отправить.\n"
                        "Попробуй позже или свяжись со мной: /help"
                    )
            else:
                await send_message(
                    chat_id,
                    "❌ Ошибка при объединении видео\n"
                    "Возможно, видео имеют несовместимый формат\n"
                    "Попробуй ещё раз: /start"
                )
        else:
            await send_message(
                chat_id,
                "⚠️ FFmpeg не установлен на сервере\n"
                "Обработка видео недоступна"
            )
    
    except Exception as e:
        logger.error(f"Error in process_and_merge_videos: {e}")
        await send_message(
            chat_id,
            f"❌ Ошибка при обработке видео:\n<code>{str(e)[:100]}</code>"
        )
    
    finally:
        # Очистить временные файлы
        project.processing = False
        
        # Удалить временные файлы (в фоне)
        if project.video1_path and os.path.exists(project.video1_path):
            try:
                os.remove(project.video1_path)
            except:
                pass
        
        if project.video2_path and os.path.exists(project.video2_path):
            try:
                os.remove(project.video2_path)
            except:
                pass


@app.post("/webhook")
async def webhook_handler(request: Request, background_tasks: BackgroundTasks):
    """Основной обработчик вебхука от Telegram"""
    
    try:
        data = await request.json()
        logger.info(f"Webhook received: {json.dumps(data, indent=2)[:500]}")
        
        # Обработка текстовых сообщений
        if "message" in data:
            message = data["message"]
            user_id = message["from"]["id"]
            chat_id = message["chat"]["id"]
            username = message["from"].get("username", "unknown")
            text = message.get("text", "")
            
            logger.info(f"Message from @{username} (ID: {user_id}): {text}")
            
            # Команда /start
            if text == "/start":
                user_projects[user_id] = VideoProject(user_id, chat_id)
                await send_message(
                    chat_id,
                    "👋 <b>Привет! 🎬 Добро пожаловать в Video Merger Bot</b>\n\n"
                    "Этот бот поможет тебе:\n"
                    "🎥 Объединить два видео в одно\n"
                    "✨ Добавить красивые переходы\n"
                    "🔊 Обработать звук\n"
                    "💾 Получить готовое видео прямо в Telegram\n\n"
                    "<b>Как начать?</b>\n"
                    "1️⃣ Нажми кнопку ниже\n"
                    "2️⃣ Загрузи первое видео\n"
                    "3️⃣ Загрузи второе видео\n"
                    "4️⃣ Выбери параметры\n"
                    "5️⃣ Получи результат!\n\n"
                    "<b>Поддерживаемые форматы:</b> MP4, AVI, MOV, MKV, FLV, WebM",
                    reply_markup={
                        "inline_keyboard": [
                            [{"text": "🎬 Начать объединение видео", "callback_data": "new_project"}],
                            [{"text": "📖 Справка", "callback_data": "help_info"}],
                            [{"text": "⚙️ Примеры параметров", "callback_data": "examples"}]
                        ]
                    }
                )
            
            # Команда /help
            elif text == "/help":
                await send_message(
                    chat_id,
                    "<b>📖 Справка</b>\n\n"
                    "<b>Доступные команды:</b>\n"
                    "/start - Начать новый проект\n"
                    "/help - Показать эту справку\n"
                    "/cancel - Отменить текущий проект\n\n"
                    "<b>Как работает бот?</b>\n"
                    "1. Загрузишь два видео\n"
                    "2. Выбираешь тип переходов\n"
                    "3. Выбираешь длительность переходов\n"
                    "4. Выбираешь как обработать звук\n"
                    "5. Бот объединяет видео\n"
                    "6. Получаешь результат в Telegram\n\n"
                    "<b>Типы переходов:</b>\n"
                    "⚡ Fade - плавный переход\n"
                    "↔️ Slide - скользящий переход\n"
                    "🔍 Zoom - переход с увеличением\n"
                    "✂️ Cut - резкий переход без эффектов",
                    reply_markup={
                        "inline_keyboard": [
                            [{"text": "🎬 Новый проект", "callback_data": "new_project"}]
                        ]
                    }
                )
            
            # Команда /cancel
            elif text == "/cancel":
                if user_id in user_projects:
                    project = user_projects[user_id]
                    if not project.processing:
                        del user_projects[user_id]
                        await send_message(chat_id, "❌ Проект отменён")
                    else:
                        await send_message(chat_id, "⏳ Дождись завершения обработки...")
                else:
                    await send_message(chat_id, "ℹ️ Нет активного проекта")
            
            # Обработка загрузки видео
            elif "video" in message:
                if user_id not in user_projects:
                    user_projects[user_id] = VideoProject(user_id, chat_id)
                
                project = user_projects[user_id]
                video = message["video"]
                file_id = video["file_id"]
                
                if project.status == "waiting_video1":
                    project.video1_file_id = file_id
                    project.status = "waiting_video2"
                    
                    await send_message(
                        chat_id,
                        "✅ <b>Первое видео загружено!</b>\n"
                        f"Размер: {video.get('file_size', 'unknown')} байт\n\n"
                        "Теперь загрузи <b>второе видео</b>, которое хочешь объединить."
                    )
                
                elif project.status == "waiting_video2":
                    project.video2_file_id = file_id
                    project.status = "ready_to_edit"
                    
                    await send_message(
                        chat_id,
                        "✅ <b>Оба видео загружены!</b>\n\n"
                        "Выбери как хочешь объединить видео:",
                        reply_markup={
                            "inline_keyboard": [
                                [
                                    {"text": "⚡ Быстро", "callback_data": "merge_fast"},
                                    {"text": "⚙️ С эффектами", "callback_data": "merge_edit"}
                                ],
                                [{"text": "🔄 Загрузить заново", "callback_data": "reset"}]
                            ]
                        }
                    )
        
        # Обработка callback кнопок
        if "callback_query" in data:
            callback = data["callback_query"]
            user_id = callback["from"]["id"]
            chat_id = callback["message"]["chat"]["id"]
            callback_data = callback["data"]
            callback_query_id = callback["id"]
            
            logger.info(f"Callback from user {user_id}: {callback_data}")
            
            # Ответить на callback сразу
            async with aiohttp.ClientSession() as session:
                await session.post(
                    f"{TELEGRAM_API}/answerCallbackQuery",
                    json={"callback_query_id": callback_query_id}
                )
            
            # Новый проект
            if callback_data == "new_project":
                user_projects[user_id] = VideoProject(user_id, chat_id)
                await send_message(
                    chat_id,
                    "🎬 <b>Загрузи первое видео</b>\n\n"
                    "Просто отправь мне видеофайл в этом чате.\n"
                    "Поддерживаемые форматы: MP4, AVI, MOV, MKV"
                )
            
            # Справка
            elif callback_data == "help_info":
                await send_message(
                    chat_id,
                    "<b>ℹ️ Как использовать бота</b>\n\n"
                    "1️⃣ <b>Загрузи два видео</b> - просто отправь видеофайлы\n"
                    "2️⃣ <b>Выбери переход</b> - Fade, Slide, Zoom или Cut\n"
                    "3️⃣ <b>Установи длительность</b> - от 0.5 до 3 секунд\n"
                    "4️⃣ <b>Обработай звук</b> - оба, по очереди или без\n"
                    "5️⃣ <b>Получи результат</b> - видео отправится в этот чат\n\n"
                    "<b>❓ Частые вопросы</b>\n"
                    "Какой макс размер видео? 500 MB\n"
                    "Сколько времени это займет? 5-15 минут в зависимости от размера"
                )
            
            # Примеры
            elif callback_data == "examples":
                await send_message(
                    chat_id,
                    "<b>📺 Примеры параметров</b>\n\n"
                    "<b>🎬 Для музыкального клипа:</b>\n"
                    "Переход: Fade\n"
                    "Длительность: 1.5 сек\n"
                    "Звук: Оба одновременно\n\n"
                    "<b>📹 Для влога:</b>\n"
                    "Переход: Cut (без эффектов)\n"
                    "Длительность: 0 сек\n"
                    "Звук: По очереди\n\n"
                    "<b>✨ Для кинематичного видео:</b>\n"
                    "Переход: Zoom\n"
                    "Длительность: 2 сек\n"
                    "Звук: Оба одновременно"
                )
            
            # Быстрое объединение
            elif callback_data == "merge_fast":
                user_projects[user_id].edit_settings = {
                    "transition": "cut",
                    "duration": 0,
                    "audio": "both"
                }
                background_tasks.add_task(process_and_merge_videos, user_id, chat_id, background_tasks)
            
            # Редактирование
            elif callback_data == "merge_edit":
                await send_message(
                    chat_id,
                    "⚙️ <b>Выбери тип переходов</b>\n\n"
                    "Это будет эффект между двумя видео:",
                    reply_markup={
                        "inline_keyboard": [
                            [
                                {"text": "⚡ Fade (Плавный)", "callback_data": "transition_fade"},
                                {"text": "↔️ Slide (Скользящий)", "callback_data": "transition_slide"}
                            ],
                            [
                                {"text": "🔍 Zoom (Увеличение)", "callback_data": "transition_zoom"},
                                {"text": "✂️ Cut (Резкий)", "callback_data": "transition_cut"}
                            ],
                            [{"text": "⬅️ Назад", "callback_data": "back_to_choice"}]
                        ]
                    }
                )
            
            # Выбор переходов
            elif callback_data.startswith("transition_"):
                transition = callback_data.split("_")[1]
                user_projects[user_id].edit_settings["transition"] = transition
                
                await send_message(
                    chat_id,
                    f"✅ Выбран переход: <b>{transition.upper()}</b>\n\n"
                    "Теперь выбери <b>длительность переходов</b>:",
                    reply_markup={
                        "inline_keyboard": [
                            [
                                {"text": "⚡ 0.5 сек", "callback_data": "duration_0.5"},
                                {"text": "📺 1 сек", "callback_data": "duration_1.0"}
                            ],
                            [
                                {"text": "🎬 1.5 сек", "callback_data": "duration_1.5"},
                                {"text": "✨ 2 сек", "callback_data": "duration_2.0"}
                            ],
                            [{"text": "⬅️ Назад", "callback_data": "merge_edit"}]
                        ]
                    }
                )
            
            # Выбор длительности
            elif callback_data.startswith("duration_"):
                try:
                    duration = float(callback_data.split("_")[1])
                    user_projects[user_id].edit_settings["duration"] = duration
                    
                    await send_message(
                        chat_id,
                        f"⏱️ Длительность: <b>{duration} сек</b>\n\n"
                        "Как обработать <b>звук</b>?",
                        reply_markup={
                            "inline_keyboard": [
                                [
                                    {"text": "🔊 Оба одновременно", "callback_data": "audio_both"},
                                    {"text": "📱 По очереди", "callback_data": "audio_sequence"}
                                ],
                                [
                                    {"text": "🔇 Без звука", "callback_data": "audio_none"}
                                ],
                                [{"text": "⬅️ Назад", "callback_data": "merge_edit"}]
                            ]
                        }
                    )
                except:
                    pass
            
            # Выбор обработки звука
            elif callback_data.startswith("audio_"):
                audio = callback_data.split("_")[1]
                user_projects[user_id].edit_settings["audio"] = audio
                
                # Запустить обработку в фоне
                background_tasks.add_task(process_and_merge_videos, user_id, chat_id, background_tasks)
            
            # Кнопки навигации
            elif callback_data == "back_to_choice":
                await send_message(
                    chat_id,
                    "Выбери как хочешь объединить видео:",
                    reply_markup={
                        "inline_keyboard": [
                            [
                                {"text": "⚡ Быстро", "callback_data": "merge_fast"},
                                {"text": "⚙️ С эффектами", "callback_data": "merge_edit"}
                            ],
                            [{"text": "🔄 Загрузить заново", "callback_data": "reset"}]
                        ]
                    }
                )
            
            elif callback_data == "reset":
                if user_id in user_projects:
                    del user_projects[user_id]
                user_projects[user_id] = VideoProject(user_id, chat_id)
                await send_message(
                    chat_id,
                    "🔄 Проект сброшен.\n"
                    "Загрузи первое видео."
                )
        
        return JSONResponse({"ok": True})
    
    except Exception as e:
        logger.error(f"Error in webhook_handler: {e}", exc_info=True)
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.get("/")
async def root():
    """Корневой путь"""
    return {
        "status": "running",
        "name": "Video Merger Telegram Bot",
        "version": "1.0.0",
        "description": "Telegram bot for merging videos with transitions"
    }


@app.get("/health")
async def health():
    """Проверка здоровья приложения"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "active_projects": len([p for p in user_projects.values() if not p.processing]),
        "processing_projects": len([p for p in user_projects.values() if p.processing])
    }


@app.post("/setup-webhook")
async def setup_webhook():
    """Установить вебхук (вызвать один раз при развёртывании)"""
    if not WEBHOOK_URL:
        return {"error": "WEBHOOK_URL not set"}
    
    url = f"{TELEGRAM_API}/setWebhook"
    data = {"url": f"{WEBHOOK_URL}/webhook"}
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=data) as response:
                result = await response.json()
                logger.info(f"Webhook setup result: {result}")
                return result
    except Exception as e:
        logger.error(f"Error setting webhook: {e}")
        return {"error": str(e)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
