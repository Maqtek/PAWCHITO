"""Ответы на исключения сервисов, общие для нескольких роутеров."""

from fastapi import Request, status
from fastapi.responses import JSONResponse

from app.services.rate_limit import TooManyAttemptsError


def too_many_attempts_handler(request: Request, exc: Exception) -> JSONResponse:
    """429 с Retry-After (контракты, «Общие правила»): по секундам фронт пишет «через N минут».

    Один обработчик на все эндпоинты с проверкой пароля или кода — новые получат его сами.
    """
    assert isinstance(exc, TooManyAttemptsError)
    return JSONResponse(
        {"detail": "Слишком много попыток. Попробуйте позже"},
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        headers={"Retry-After": str(exc.retry_after)},
    )
