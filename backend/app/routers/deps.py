"""Зависимости FastAPI для роутеров."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.cookies import REFRESH_COOKIE_NAME
from app.core.redis import redis_client
from app.core.security import InvalidTokenError, decode_access_token
from app.db.session import get_db
from app.models import User, UserRole
from app.repositories.user import UserRepository
from app.services.auth import AuthService
from app.services.rate_limit import AttemptLimiter
from app.services.users import UserService

DbSession = Annotated[Session, Depends(get_db, scope="function")]


def get_attempt_limiter() -> AttemptLimiter:
    return AttemptLimiter(redis_client)


AttemptLimiterDep = Annotated[AttemptLimiter, Depends(get_attempt_limiter)]


def get_auth_service(db: DbSession, limiter: AttemptLimiterDep) -> AuthService:
    return AuthService(db, limiter)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def get_user_service(db: DbSession) -> UserService:
    return UserService(db)


UserServiceDep = Annotated[UserService, Depends(get_user_service)]

# Приходит только на /api/auth/* (Path cookie), в других роутерах всегда None
RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)]


# --- Текущий пользователь ---

# auto_error=False: без заголовка Authorization отвечаем своим 401, а не стандартным
_bearer = HTTPBearer(auto_error=False)
BearerCredentials = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def _unauthorized() -> HTTPException:
    # На 401 фронт один раз обновляет токен через /auth/refresh и повторяет запрос
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Требуется вход", headers={"WWW-Authenticate": "Bearer"}
    )


def get_user_allow_password_change(db: DbSession, credentials: BearerCredentials) -> User:
    """Пользователь из access-токена; временный пароль не мешает.

    Только для GET /users/me и POST /auth/change-password (контракты, 403
    password_change_required). Остальным эндпоинтам — CurrentUser.
    """
    if credentials is None:
        raise _unauthorized()
    try:
        payload = decode_access_token(credentials.credentials)
    except InvalidTokenError:
        raise _unauthorized() from None
    # Роль и активность берём из БД, а не из токена: токен живёт 15 минут,
    # а блокировка и смена роли должны действовать сразу (БП §1)
    user = UserRepository(db).get(payload.user_id)
    if user is None:
        raise _unauthorized()
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Аккаунт заблокирован")
    return user


UserAllowPasswordChange = Annotated[User, Depends(get_user_allow_password_change)]


def get_current_user(user: UserAllowPasswordChange) -> User:
    """Пользователь из access-токена; с временным паролем — 403, пока его не сменит."""
    if user.must_change_password:
        # Строка-код, а не текст: по ней фронт уводит на экран смены пароля
        raise HTTPException(status.HTTP_403_FORBIDDEN, "password_change_required")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: UserRole) -> Callable[[User], User]:
    """Зависимость «текущий пользователь одной из ролей», иначе 403."""

    def check_role(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Недостаточно прав")
        return user

    return check_role


OwnerUser = Annotated[User, Depends(require_role(UserRole.owner))]
ClinicUser = Annotated[User, Depends(require_role(UserRole.clinic))]
AdminUser = Annotated[User, Depends(require_role(UserRole.admin))]
