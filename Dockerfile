# Dockerfile для локального развития Video Merger Bot

FROM python:3.11-slim

# Установить FFmpeg и другие зависимости
RUN apt-get update && apt-get install -y \
    ffmpeg \
    ffprobe \
    && rm -rf /var/lib/apt/lists/*

# Установить рабочую директорию
WORKDIR /app

# Скопировать файлы требований
COPY requirements.txt .

# Установить Python зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Скопировать исходный код
COPY api_handler_full.py .
COPY video_processor.py .

# Создать директории для временных файлов
RUN mkdir -p /tmp/video_processing /tmp/video_output

# Установить переменные окружения по умолчанию
ENV PORT=8000
ENV PYTHONUNBUFFERED=1

# Открыть порт
EXPOSE 8000

# Запустить приложение
CMD ["python", "-m", "uvicorn", "api_handler_full:app", "--host", "0.0.0.0", "--port", "8000"]
