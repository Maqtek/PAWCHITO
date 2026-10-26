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
from app.services.rate_limit import AttemptLimiter, FailedAttempt


class EmailTakenError(Exception):
    pass


class InvalidCredentialsError(FailedAttempt):
    pass


class InvalidCurrentPasswordError(FailedAttempt):
    pass


class UserBlockedError(Exception):
    pass


class InvalidRefreshTokenError(Exception):
    """Токена нет, он истёк или отозван, либо пользователь заблокирован — нужен новый вход."""


class InvalidRecoveryCodeError(FailedAttempt):
    """Неверная пара email и код — без уточнения, что именно не так."""


def _now() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone))


@dataclass(frozen=True)
class IssuedTokens:
    access_token: str
    refresh_token: str  # уходит только в cookie


class AuthService:
    def __init__(self, session: Session, limiter: AttemptLimiter) -> None:
        self.users = UserRepository(session)
        self.limiter = limiter
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
        with self.limiter.attempt(email):
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
            # Токен уже обменяли, а он пришёл ещё раз: копия есть у кого-то ещё.
            # Кто из двоих владелец, не понять — завершаем все сессии пользователя.
            # Роутер не должен превращать это в исключение: удаление обязано закоммититься.
            self.refresh_tokens.delete_all_for_user(token.user_id)
            raise InvalidRefreshTokenError
        if not token.is_valid(now) or not token.user.is_active:
            raise InvalidRefreshTokenError
        self.refresh_tokens.revoke(token, now)
        return self._issue_tokens(token.user)

    def logout(self, refresh_token: str | None) -> None:
        """Удаляет текущий refresh-токен. Нет cookie или токена — ничего не делаем."""
        if not refresh_token:
            return
        token = self.refresh_tokens.get_by_hash(hash_refresh_token(refresh_token))
        if token is not None:
            # Удаляем, а не отзываем: если ответ на выход потеряется и браузер
            # потом обменяет эту cookie, это не кража — просто 401
            self.refresh_tokens.delete(token)

    def change_password(self, user: User, current_password: str, new_password: str) -> IssuedTokens:
        """Новый пароль; остальные сессии завершаются, текущая получает новые токены.

        Сбрасывает и must_change_password: так клиника меняет временный пароль.
        """
        self._check_current_password(user, current_password)
        self.users.update(
            user, password_hash=hash_password(new_password), must_change_password=False
        )
        self.refresh_tokens.delete_all_for_user(user.id)
        return self._issue_tokens(user)

    def recover(self, email: str, recovery_code: str, new_password: str) -> str:
        """Новый пароль по коду восстановления. Возвращает новый код: старый одноразовый.

        Все сессии завершаются, токены не выдаём — дальше обычный вход с новым паролем.
        """
        with self.limiter.attempt(email):
            user = self.users.get_by_email(email)
            # Код есть только у владельца; для чужого email и для клиники тратим то же время
            # на Argon2, чтобы по скорости ответа не узнать, какие email зарегистрированы
            if user is None or user.recovery_code_hash is None:
                verify_password(recovery_code, DUMMY_PASSWORD_HASH)
                raise InvalidRecoveryCodeError
            if not verify_password(recovery_code, user.recovery_code_hash):
                raise InvalidRecoveryCodeError
        new_code = generate_recovery_code()
        self.users.update(
            user,
            password_hash=hash_password(new_password),
            recovery_code_hash=hash_password(new_code),
        )
        self.refresh_tokens.delete_all_for_user(user.id)
        return new_code

    def regenerate_recovery_code(self, user: User, current_password: str) -> str:
        """Новый код в профиле; старый перестаёт действовать (БП §1). Сессии не трогаем."""
        self._check_current_password(user, current_password)
        new_code = generate_recovery_code()
        self.users.update(user, recovery_code_hash=hash_password(new_code))
        return new_code

    def reset_password(self, user: User, new_password: str, *, must_change: bool = False) -> None:
        """Пароль задаёт не сам пользователь: администратору — через CLI (#27),
        клинике — временный от админа (этап 3, Р-36, must_change=True).

        Все сессии завершаются, пауза после неудачных попыток снимается.
        """
        self.users.update(
            user, password_hash=hash_password(new_password), must_change_password=must_change
        )
        self.refresh_tokens.delete_all_for_user(user.id)
        self.limiter.reset(user.email)

    def _check_current_password(self, user: User, password: str) -> None:
        """Смена пароля и новый код: тот же счётчик, что у входа (Р-31) -
        иначе из захваченной сессии можно подбирать пароль без ограничений.
        """
        with self.limiter.attempt(user.email):
            if not verify_password(password, user.password_hash):
                raise InvalidCurrentPasswordError

    def _issue_tokens(self, user: User) -> IssuedTokens:
        refresh_token = generate_refresh_token()
        self.refresh_tokens.create(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=_now() + timedelta(days=settings.refresh_token_expire_days),
        )
        return IssuedTokens(create_access_token(user.id, user.role.value), refresh_token)
