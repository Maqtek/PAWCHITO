"""Регистрация и вход. HTTP не знает: на ошибки бросает свои исключения,
роутер превращает их в коды ответа.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    generate_recovery_code,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models import User, UserRole
from app.repositories.refresh_token import RefreshTokenRepository
from app.repositories.user import UserRepository


class EmailTakenError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class UserBlockedError(Exception):
    pass


class InvalidRefreshTokenError(Exception):
    """Токена нет, он истёк или отозван, либо пользователь заблокирован — нужен новый вход."""


def _now() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone))


@dataclass(frozen=True)
class IssuedTokens:
    access_token: str
    refresh_token: str  # уходит только в cookie


class AuthService:
    def __init__(self, session: Session) -> None:
        self.users = UserRepository(session)
        self.refresh_tokens = RefreshTokenRepository(session)

    def register(self, email: str, password: str, full_name: str) -> tuple[User, str, IssuedTokens]:
        """Новый владелец. Возвращает пользователя, код восстановления и токены."""
        recovery_code = generate_recovery_code()
        try:
            user = self.users.create(
                email=email,
                password_hash=hash_password(password),
                full_name=full_name,
                role=UserRole.owner,
                recovery_code_hash=hash_password(recovery_code),
            )
        except IntegrityError:
            # Уникальный индекс по lower(email) ловит и одновременные регистрации,
            # поэтому без SELECT заранее. Транзакцию откатит get_db.
            raise EmailTakenError from None
        return user, recovery_code, self._issue_tokens(user)

    def login(self, email: str, password: str) -> IssuedTokens:
        user = self.users.get_by_email(email)
        if user is None:
            verify_password(password, DUMMY_PASSWORD_HASH)
            raise InvalidCredentialsError
        if not verify_password(password, user.password_hash):
            raise InvalidCredentialsError
        # Блокировку проверяем после пароля: без пароля статус аккаунта не раскрываем
        if not user.is_active:
            raise UserBlockedError
        return self._issue_tokens(user)

    def refresh(self, refresh_token: str | None) -> IssuedTokens:
        """Обмен refresh-токена на новую пару: старый отзывается."""
        if not refresh_token:
            raise InvalidRefreshTokenError
        now = _now()
        token = self.refresh_tokens.get_by_hash(hash_refresh_token(refresh_token), for_update=True)
        if token is None:
            raise InvalidRefreshTokenError
        if token.revoked_at is not None:
            # Отозванный токен пришёл ещё раз: копия токена есть у кого-то ещё.
            # Кто из двоих владелец, не понять — завершаем все сессии пользователя.
            # Роутер не должен превращать это в исключение: отзыв обязан закоммититься.
            self.refresh_tokens.revoke_all_for_user(token.user_id, now)
            raise InvalidRefreshTokenError
        if not token.is_valid(now) or not token.user.is_active:
            raise InvalidRefreshTokenError
        self.refresh_tokens.revoke(token, now)
        return self._issue_tokens(token.user)

    def logout(self, refresh_token: str | None) -> None:
        """Отзывает текущий refresh-токен. Нет cookie или токен уже отозван — ничего не делаем."""
        if not refresh_token:
            return
        token = self.refresh_tokens.get_by_hash(hash_refresh_token(refresh_token))
        if token is not None and token.revoked_at is None:
            self.refresh_tokens.revoke(token, _now())

    def _issue_tokens(self, user: User) -> IssuedTokens:
        refresh_token = generate_refresh_token()
        self.refresh_tokens.create(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=_now() + timedelta(days=settings.refresh_token_expire_days),
        )
        return IssuedTokens(create_access_token(user.id, user.role.value), refresh_token)
