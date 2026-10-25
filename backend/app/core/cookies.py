"""Cookie с refresh-токеном.

HttpOnly        — JS не прочитает токен, XSS его не украдёт;
Secure          — только по HTTPS (http://localhost браузеры считают безопасным);
SameSite=Strict — с запросом с чужого сайта cookie не уйдёт (защита от CSRF);
Path=/api/auth  — cookie уходит только на эндпоинты авторизации.
"""

from fastapi import Response

from app.core.config import settings

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth"


def set_refresh_cookie(response: Response, token: str) -> None:
    """Вызывать при входе, регистрации, refresh и смене пароля - везде, где выдаётся новый токен."""
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path=REFRESH_COOKIE_PATH,
        secure=settings.cookie_secure,
        httponly=True,
        samesite="strict",
    )


def clear_refresh_cookie(response: Response) -> None:
    """Вызывать при выходе и при ответе 401 на /auth/refresh."""
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        secure=settings.cookie_secure,
        httponly=True,
        samesite="strict",
    )
