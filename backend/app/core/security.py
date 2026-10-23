"""Чистые функции безопасности: пароли, JWT, refresh-токены, коды.

Модуль не ходит в БД и не знает про HTTP: на входе и выходе — строки.
Что хранить, искать и отзывать, решает сервис auth.
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

# --- Пароли ---

_password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Хеш для записи в БД. Каждый вызов даёт новый хеш (новая соль) —
    сравнивать хеши между собой нельзя, только через verify_password.
    Используется и для кодов восстановления, и для временных паролей клиник.
    """
    return _password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """Совпадает ли введённый пароль с хешем из БД."""
    return _password_hash.verify(password, hashed)


# Если email при входе не найден, сервис всё равно вызывает
# verify_password(password, DUMMY_PASSWORD_HASH). Иначе ответ «нет такого email»
# приходил бы мгновенно, а «неверный пароль» — с задержкой Argon2,
# и по времени ответа можно было бы узнать, какие email зарегистрированы.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(16))


# --- Access-токен (JWT) ---


class InvalidTokenError(Exception):
    """Токен поддельный, истёк или без обязательных полей."""


@dataclass(frozen=True)
class AccessTokenPayload:
    """Что достаём из токена."""

    user_id: int
    role: str


def create_access_token(user_id: int, role: str) -> str:
    now = datetime.now(ZoneInfo(settings.timezone))
    payload = {
        "sub": str(user_id),  # по RFC 7519 sub — строка, PyJWT это проверяет
        "role": role,
        "iat": now,  # когда выпущен
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),  # когда истечет
    }

    return jwt.encode(
        payload, settings.jwt_secret.get_secret_value(), algorithm=settings.jwt_algorithm
    )


def decode_access_token(token: str) -> AccessTokenPayload:
    """Проверяет подпись и срок. Наружу отдаёт только своё исключение,
    чтобы остальной код не зависел от PyJWT.
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            # принимаем только свой алгоритм, чтобы не было "alg": "none"
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "role", "exp"]},
        )
        return AccessTokenPayload(user_id=int(payload["sub"]), role=payload["role"])
    except (jwt.PyJWTError, ValueError) as exc:
        raise InvalidTokenError from exc


# --- Refresh-токен ---


def generate_refresh_token() -> str:
    # secrets, а не random - random предсказуем, по его выходам восстанавливается состояние
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """Хеш для поиска в БД: WHERE token_hash = hash_refresh_token(cookie)."""
    # Не Argon2: 256 случайных бит не перебрать, медленный хеш не нужен.
    # А Argon2 с солью даёт каждый раз новый хеш — по нему запись не найти.
    return hashlib.sha256(token.encode()).hexdigest()


# --- Коды восстановления и временные пароли ---

_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_TEMP_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _random_groups(alphabet: str, groups: int, size: int = 4) -> str:
    """Случайные группы по size символов через дефис: ABCD-EFGH-..."""
    return "-".join("".join(secrets.choice(alphabet) for _ in range(size)) for _ in range(groups))


def generate_recovery_code() -> str:
    """XXXX-XXXX-XXXX-XXXX, например K7QM-2XPA-9RTD-4WNB"""
    return _random_groups(_CODE_ALPHABET, groups=4)


def normalize_recovery_code(code: str) -> str:
    """Приводит ввод пользователя к виду, в котором код хешировали:
    'k7qm 2xpa-9rtd4wnb' -> 'K7QM-2XPA-9RTD-4WNB'.
    """
    chars = "".join(c for c in code.upper() if c.isalnum())
    return "-".join(chars[i : i + 4] for i in range(0, len(chars), 4))


def generate_temporary_password() -> str:
    """Временный пароль клиники, например vT4q-9mKx-2Lpe."""
    return _random_groups(_TEMP_PASSWORD_ALPHABET, groups=3)
