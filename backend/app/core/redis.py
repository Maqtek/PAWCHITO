"""Клиент Redis для запросов приложения.

Логирование держит свой клиент (core/logging.py): оно пишет из фонового потока.
Таймаут в секунду и без повторов: если Redis лёг, запрос не должен висеть.
"""

import redis
from redis.backoff import NoBackoff
from redis.retry import Retry

from app.core.config import settings

redis_client = redis.Redis.from_url(
    settings.redis_url,
    decode_responses=True,
    socket_connect_timeout=1,
    socket_timeout=1,
    retry=Retry(NoBackoff(), 0),
)
