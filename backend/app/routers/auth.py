"""Эндпоинты /api/auth/*: регистрация и вход (контракты, раздел 1)."""

from fastapi import APIRouter, HTTPException, Response, status

from app.core.config import settings
from app.core.cookies import set_refresh_cookie
from app.routers.deps import AuthServiceDep
from app.schemas.auth import LoginIn, RegisterIn, RegisterOut, TokenOut
from app.schemas.user import UserOut
from app.services.auth import (
    EmailTakenError,
    InvalidCredentialsError,
    IssuedTokens,
    UserBlockedError,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_out(response: Response, tokens: IssuedTokens) -> TokenOut:
    """Refresh-токен — в cookie, access-токен — в тело ответа."""
    set_refresh_cookie(response, tokens.refresh_token)
    return TokenOut(
        access_token=tokens.access_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, response: Response, service: AuthServiceDep) -> RegisterOut:
    try:
        user, recovery_code, tokens = service.register(data.email, data.password, data.full_name)
    except EmailTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email уже зарегистрирован") from None
    token = _token_out(response, tokens)
    return RegisterOut(
        **token.model_dump(), user=UserOut.model_validate(user), recovery_code=recovery_code
    )


@router.post("/login", status_code=status.HTTP_200_OK)
def login(data: LoginIn, response: Response, service: AuthServiceDep) -> TokenOut:
    try:
        tokens = service.login(data.email, data.password)
    except InvalidCredentialsError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный email или пароль") from None
    except UserBlockedError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Аккаунт заблокирован") from None
    return _token_out(response, tokens)
