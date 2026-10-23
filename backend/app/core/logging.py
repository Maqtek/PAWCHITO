"""Логи: logging -> QueueHandler -> фоновый поток -> Redis Stream; без Redis — stdout."""

import copy
import json
import logging
import sys
import time
from contextvars import ContextVar
from datetime import datetime
from logging.handlers import QueueHandler, QueueListener
from queue import SimpleQueue
from zoneinfo import ZoneInfo

import redis
from redis.backoff import NoBackoff
from redis.retry import Retry

from app.core.config import settings

TZ = ZoneInfo(settings.timezone)

# Контекст запроса
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_var: ContextVar[int | None] = ContextVar("user_id", default=None)

# Необязательные поля записи; method, path, status, duration_ms передаются через extra.
OPTIONAL_FIELDS = ("request_id", "user_id", "method", "path", "status", "duration_ms")


def build_entry(record: logging.LogRecord) -> dict[str, str]:
    entry = {
        "time": datetime.fromtimestamp(record.created, TZ).isoformat(timespec="milliseconds"),
        "level": record.levelname,
        "logger": record.name,
        "message": record.getMessage(),
    }

    for name in OPTIONAL_FIELDS:
        value = getattr(record, name, None)
        if value is not None:
            entry[name] = str(value)

    if record.exc_text:
        entry["exc"] = record.exc_text

    return entry


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(build_entry(record), ensure_ascii=False)


class ContextQueueHandler(QueueHandler):
    """Готовит запись в потоке запроса: контекст и стектрейс до передачи в очередь."""

    def prepare(self, record: logging.LogRecord) -> logging.LogRecord:
        record = copy.copy(record)
        record.msg, record.args = record.getMessage(), None
        if record.exc_info:
            record.exc_text = logging.Formatter().formatException(record.exc_info)
            record.exc_info = None
        if getattr(record, "request_id", None) is None:
            record.request_id = request_id_var.get()
        if getattr(record, "user_id", None) is None:
            record.user_id = user_id_var.get()

        return record


class RedisStreamHandler(logging.Handler):
    """Пишет запись в Stream с обрезкой по сроку хранения; при ошибке Redis — в fallback."""

    retry_after = 5.0

    def __init__(
        self, client: redis.Redis, stream: str, retention_days: int, fallback: logging.Handler
    ) -> None:
        super().__init__()
        self.client = client
        self.stream = stream
        self.retention_ms = retention_days * 24 * 60 * 60 * 1000
        self.fallback = fallback
        self._down_until = 0.0

    def emit(self, record: logging.LogRecord) -> None:
        if time.monotonic() >= self._down_until:
            entry = build_entry(record)
            min_id = int(time.time() * 1000) - self.retention_ms
            try:
                self.client.xadd(self.stream, entry, minid=min_id, approximate=True)  # type: ignore[arg-type]
                return
            except redis.RedisError as exc:
                self._down_until = time.monotonic() + self.retry_after
                self._report_down(exc)
        self.fallback.handle(record)

    def _report_down(self, exc: Exception) -> None:
        notice = logging.makeLogRecord(
            {
                "name": __name__,
                "levelno": logging.WARNING,
                "levelname": "WARNING",
                "msg": f"Redis недоступен, логи идут в stdout: {exc}",
            }
        )
        self.fallback.handle(notice)


def setup_logging() -> QueueListener:
    stdout = logging.StreamHandler(sys.stdout)
    stdout.setFormatter(JSONFormatter())

    client = redis.Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=1,
        socket_timeout=1,
        retry=Retry(NoBackoff(), 0),
    )
    redis_handler = RedisStreamHandler(
        client, settings.log_stream, settings.log_retention_days, fallback=stdout
    )

    queue: SimpleQueue[logging.LogRecord] = SimpleQueue()
    root = logging.getLogger()
    root.handlers = [ContextQueueHandler(queue)]
    root.setLevel(settings.log_level)
    # Запросы логирует RequestLogMiddleware, access-лог uvicorn их бы дублировал.
    logging.getLogger("uvicorn.access").disabled = True

    listener = QueueListener(queue, redis_handler)
    listener.start()
    return listener
