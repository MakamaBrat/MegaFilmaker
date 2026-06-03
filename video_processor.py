"""
Модуль для обработки и объединения видео с помощью FFmpeg
"""

import os
import logging
import subprocess
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class VideoProcessor:
    """Класс для обработки видеофайлов"""
    
    # Временная директория для файлов
    TEMP_DIR = "/tmp/video_processing"
    OUTPUT_DIR = "/tmp/video_output"
    
    # Поддерживаемые форматы
    SUPPORTED_FORMATS = ['mp4', 'avi', 'mov', 'mkv', 'flv', 'webm']
    
    # Максимальный размер файла (500 MB)
    MAX_FILE_SIZE = 500 * 1024 * 1024
    
    @classmethod
    def init_directories(cls):
        """Инициализировать необходимые директории"""
        os.makedirs(cls.TEMP_DIR, exist_ok=True)
        os.makedirs(cls.OUTPUT_DIR, exist_ok=True)
    
    @staticmethod
    async def run_ffmpeg(command: list) -> bool:
        """Запустить FFmpeg команду асинхронно"""
        try:
            process = await asyncio.create_subprocess_exec(
                *command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                logger.info("FFmpeg command executed successfully")
                return True
            else:
                logger.error(f"FFmpeg error: {stderr.decode()}")
                return False
        except Exception as e:
            logger.error(f"Error running FFmpeg: {e}")
            return False
    
    @staticmethod
    def get_video_info(video_path: str) -> Optional[Dict]:
        """Получить информацию о видео (продолжительность, разрешение и т.д.)"""
        try:
            command = [
                'ffprobe',
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1:noprint_wrappers=1',
                video_path
            ]
            result = subprocess.run(command, capture_output=True, text=True)
            
            if result.returncode == 0:
                duration = float(result.stdout.strip())
                return {
                    'duration': duration,
                    'path': video_path,
                    'exists': os.path.exists(video_path)
                }
        except Exception as e:
            logger.error(f"Error getting video info: {e}")
        
        return None
    
    @classmethod
    async def merge_videos(cls,
                          video1_path: str,
                          video2_path: str,
                          output_path: str,
                          transition: str = "fade",
                          transition_duration: float = 1.0,
                          audio_mode: str = "both") -> bool:
        """
        Объединить два видео с переходом
        
        Args:
            video1_path: Путь к первому видео
            video2_path: Путь ко второму видео
            output_path: Путь для сохранения результата
            transition: Тип переходов (fade, cut, slide, zoom)
            transition_duration: Длительность переходов в секундах
            audio_mode: Способ обработки звука (both, sequence, none)
        """
        
        try:
            # Инициализировать директории
            cls.init_directories()
            
            # Проверить существование файлов
            if not os.path.exists(video1_path) or not os.path.exists(video2_path):
                logger.error("One or both video files not found")
                return False
            
            # Шаг 1: Получить информацию о видео
            info1 = cls.get_video_info(video1_path)
            info2 = cls.get_video_info(video2_path)
            
            if not info1 or not info2:
                logger.error("Could not get video information")
                return False
            
            # Шаг 2: Подготовить список видео файлов
            concat_file = os.path.join(cls.TEMP_DIR, f"concat_{datetime.now().timestamp()}.txt")
            
            with open(concat_file, 'w') as f:
                f.write(f"file '{os.path.abspath(video1_path)}'\n")
                f.write(f"file '{os.path.abspath(video2_path)}'\n")
            
            # Шаг 3: Построить FFmpeg команду в зависимости от типа переходов
            if transition == "cut" or transition_duration == 0:
                # Простое объединение без переходов
                command = cls._build_concat_command(
                    concat_file,
                    output_path,
                    audio_mode
                )
            else:
                # Объединение с переходами
                command = cls._build_transition_command(
                    video1_path,
                    video2_path,
                    output_path,
                    transition,
                    transition_duration,
                    audio_mode
                )
            
            # Шаг 4: Выполнить команду
            logger.info(f"Executing FFmpeg command: {' '.join(command)}")
            success = await cls.run_ffmpeg(command)
            
            # Шаг 5: Очистить временные файлы
            try:
                os.remove(concat_file)
            except:
                pass
            
            return success
        
        except Exception as e:
            logger.error(f"Error in merge_videos: {e}")
            return False
    
    @staticmethod
    def _build_concat_command(concat_file: str, output_path: str, audio_mode: str) -> list:
        """Построить команду для простого объединения видео"""
        command = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_file,
            '-c', 'copy',  # Копировать без переодирования (быстро)
            '-y',  # Перезаписать выходной файл
            output_path
        ]
        
        if audio_mode == "none":
            command.insert(-1, '-an')  # Убрать звук
        
        return command
    
    @staticmethod
    def _build_transition_command(video1: str,
                                  video2: str,
                                  output_path: str,
                                  transition: str,
                                  duration: float,
                                  audio_mode: str) -> list:
        """Построить команду с переходами между видео"""
        
        # FFmpeg фильтры для разных типов переходов
        transition_filters = {
            'fade': f'xfade=transition=fade:duration={duration}',
            'slide': f'xfade=transition=slideright:duration={duration}',
            'zoom': f'xfade=transition=zoomin:duration={duration}',
            'wiperight': f'xfade=transition=wiperight:duration={duration}',
            'wipeleft': f'xfade=transition=wipeleft:duration={duration}',
        }
        
        filter_str = transition_filters.get(transition, f'xfade=transition=fade:duration={duration}')
        
        command = [
            'ffmpeg',
            '-i', video1,
            '-i', video2,
            '-filter_complex',
            f'[0:v][1:v]{filter_str}[v];[0:a][1:a]acrossfade=d={duration}:c1=tri:c2=tri[a]',
            '-map', '[v]',
            '-map', '[a]',
            '-y',
            output_path
        ]
        
        if audio_mode == "none":
            # Без звука
            command = [
                'ffmpeg',
                '-i', video1,
                '-i', video2,
                '-filter_complex',
                f'[0:v][1:v]{filter_str}[v]',
                '-map', '[v]',
                '-an',
                '-y',
                output_path
            ]
        elif audio_mode == "sequence":
            # Звуки по очереди (без наложения)
            # Это более сложная операция, требует вычисления длительности
            pass
        
        return command
    
    @classmethod
    async def compress_video(cls,
                            input_path: str,
                            output_path: str,
                            quality: str = "medium") -> bool:
        """
        Сжать видео для уменьшения размера файла
        
        Args:
            input_path: Путь к исходному видео
            output_path: Путь для сохранения сжатого видео
            quality: Уровень качества (low, medium, high)
        """
        
        # Настройки качества для H.264
        quality_settings = {
            'low': {'crf': '28', 'preset': 'slow'},      # Меньший размер, но хуже качество
            'medium': {'crf': '23', 'preset': 'medium'},  # Баланс между качеством и размером
            'high': {'crf': '18', 'preset': 'fast'},      # Лучшее качество, больший размер
        }
        
        settings = quality_settings.get(quality, quality_settings['medium'])
        
        command = [
            'ffmpeg',
            '-i', input_path,
            '-c:v', 'libx264',
            '-preset', settings['preset'],
            '-crf', settings['crf'],
            '-c:a', 'aac',
            '-b:a', '128k',
            '-y',
            output_path
        ]
        
        logger.info(f"Compressing video with quality: {quality}")
        return await cls.run_ffmpeg(command)
    
    @staticmethod
    def cleanup(file_path: str):
        """Удалить файл"""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Cleaned up: {file_path}")
        except Exception as e:
            logger.error(f"Error cleaning up {file_path}: {e}")


# Примеры использования
async def example_merge():
    """Пример использования функции объединения видео"""
    
    video1 = "/path/to/video1.mp4"
    video2 = "/path/to/video2.mp4"
    output = "/tmp/video_output/merged.mp4"
    
    success = await VideoProcessor.merge_videos(
        video1,
        video2,
        output,
        transition="fade",
        transition_duration=1.5,
        audio_mode="both"
    )
    
    if success:
        print(f"Video merged successfully: {output}")
    else:
        print("Video merge failed")


if __name__ == "__main__":
    # Инициализировать директории
    VideoProcessor.init_directories()
    print("VideoProcessor initialized")
