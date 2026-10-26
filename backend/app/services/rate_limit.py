"""Лимит неудачных попыток.

Один счётчик на аккаунт, ключ — email: вход, восстановление, смена пароля
и новый код восстановления считаются вместе. Для несуществующего email счётчик
тоже ведётся — иначе по появлению паузы можно было бы узнать, кто зарегистрирован.

Хранится в Redis: ключи исчезают сами по TTL и не теряются при перезапуске бэкенда.
"""

import functools
import logging
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import ParamSpec

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

P = ParamSpec("P")


class FailedAttempt(Exception):
    """Базовый класс ошибок, которые считаются неудачной попыткой: неверный пароль или код."""


class TooManyAttemptsError(Exception):
    """Идёт пауза; retry_after — сколько секунд осталось (заголовок Retry-After)."""

    def __init__(self, retry_after: int) -> None:
        super().__init__(retry_after)
        self.retry_after = retry_after


def _fail_open(message: str) -> Callable[[Callable[P, None]], Callable[P, None]]:
    """Redis лёг — пишем ошибку в лог и работаем без лимита, а не блокируем вход всем.

    Ловит только RedisError: TooManyAttemptsError из check проходит насквозь.
    """

    def decorate(method: Callable[P, None]) -> Callable[P, None]:
        @functools.wraps(method)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> None:
            try:
                method(*args, **kwargs)
            except redis.RedisError:
                logger.exception(message)

        return wrapper

    return decorate


class AttemptLimiter:
    def __init__(self, client: redis.Redis) -> None:
        self.client = client

    @contextmanager
    def attempt(self, email: str) -> Iterator[None]:
        """Одна попытка: пауза — TooManyAttemptsError ещё до проверки; FailedAttempt внутри
        блока — неудача; блок прошёл без исключений — счётчик обнуляется.

        Пауза действует и на верный пароль: иначе подбор просто продолжился бы.
        Прочие исключения проходят насквозь, счётчик не трогают.
        """
        self.check(email)
        try:
            yield
        except FailedAttempt:
            self.register_failure(email)
            raise
        self.reset(email)

    @staticmethod
    def _keys(email: str) -> tuple[str, str]:
        key = email.strip().lower()
        return f"auth:failures:{key}", f"auth:lock:{key}"

    @_fail_open("Лимит попыток не проверен: Redis недоступен")
    def check(self, email: str) -> None:
        _, lock = self._keys(email)
        ttl = self.client.ttl(lock)  # -2 - ключа нет
        if ttl > 0:
            raise TooManyAttemptsError(ttl)

    @_fail_open("Неудачная попытка не учтена: Redis недоступен")
    def register_failure(self, email: str) -> None:
        """Неверный пароль или код. Пятая неудача подряд включает паузу.

        Неудачи считаются подряд: счётчик живёт 15 минут с последней неудачи
        и обнуляется при успехе (reset).
        """
        failures, lock = self._keys(email)
        window = settings.auth_lock_minutes * 60
        # pipeline — MULTI/EXEC: счётчик и его срок ставятся одной транзакцией
        with self.client.pipeline() as pipe:
            pipe.incr(failures)
            pipe.expire(failures, window)
            count, _ = pipe.execute()
        if count >= settings.auth_max_failures:
            with self.client.pipeline() as pipe:
                pipe.set(lock, 1, ex=window)
                pipe.delete(failures)
                pipe.execute()

    @_fail_open("Счётчик попыток не сброшен: Redis недоступен")
    def reset(self, email: str) -> None:
        """Успешная проверка — счётчик обнуляется. Сброс пароля админом снимает и паузу (Р-36)."""
        self.client.delete(*self._keys(email))
