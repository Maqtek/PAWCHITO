"""
Middleware — это обёртка вокруг всего приложения.
Каждый запрос проходит через неё до роутера, а ответ — после.
Это подходящее место для всего, что касается каждого запроса: ID, логирования, замера времени.
"""

import json
import logging
import re
import time
from uuid import uuid4

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import request_id_var

logger = logging.getLogger("app.request")

# Чужой X-Request-ID (например, от прокси) принимаем, только если он безопасен для логов.
INCOMING_REQUEST_ID = re.compile(r"[A-Za-z0-9-]{8,64}")
# Healthcheck Docker дёргается каждые несколько секунд и забил бы стрим.
SKIP_PATHS = {"/health"}


def _level_for(status: int) -> int:
    if status >= 500:
        return logging.ERROR
    if status in (403, 409):
        return logging.WARNING
    return logging.INFO


class RequestLogMiddleware:
    """Выдаёт request_id каждому запросу, отдаёт его в X-Request-ID и пишет итог запроса в лог."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get("x-request-id", "")
        request_id = incoming if INCOMING_REQUEST_ID.fullmatch(incoming) else uuid4().hex
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status = 500
        response_started = False

        async def send_with_request_id(message: Message) -> None:
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                status = message["status"]
                response_started = True
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            self._log(scope, 500, started, exc_info=True)
            if response_started:
                raise
            await self._send_server_error(send, request_id)
        else:
            if scope["path"] not in SKIP_PATHS:
                self._log(scope, status, started)
        finally:
            request_id_var.reset(token)

    @staticmethod
    def _log(scope: Scope, status: int, started: float, exc_info: bool = False) -> None:
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        logger.log(
            _level_for(status),
            "%s %s %s",
            scope["method"],
            scope["path"],
            status,
            exc_info=exc_info,
            extra={
                "method": scope["method"],
                "path": scope["path"],
                "status": status,
                "duration_ms": duration_ms,
            },
        )

    @staticmethod
    async def _send_server_error(send: Send, request_id: str) -> None:
        body = json.dumps({"detail": "Внутренняя ошибка сервера"}, ensure_ascii=False).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"x-request-id", request_id.encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
