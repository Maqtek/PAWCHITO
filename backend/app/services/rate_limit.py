"""Лимит неудачных попыток.

Один счётчик на аккаунт, ключ — email: вход, восстановление, смена пароля
и новый код восстановления считаются вместе. Для несуществующего email счётчик
тоже ведётся — иначе по появлению паузы можно было бы узнать, кто зарегистрирован.

Хранится в Redis: ключи исчезают сами по TTL и не теряются при перезапуске бэкенда.
"""

import logging

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)


class TooManyAttemptsError(Exception):
    """Идёт пауза; retry_after — сколько секунд осталось (заголовок Retry-After)."""

    def __init__(self, retry_after: int) -> None:
        super().__init__(retry_after)
        self.retry_after = retry_after


class AttemptLimiter:
    def __init__(self, client: redis.Redis) -> None:
        self.client = client

    @staticmethod
    def _keys(email: str) -> tuple[str, str]:
        key = email.strip().lower()
        return f"auth:failures:{key}", f"auth:lock:{key}"

    def check(self, email: str) -> None:
        """Перед проверкой пароля или кода: идёт пауза — TooManyAttemptsError.

        Пауза действует и на верный пароль: иначе подбор просто продолжился бы.
        """
        _, lock = self._keys(email)
        try:
            ttl = self.client.ttl(lock)  # -2 - ключа нет
        except redis.RedisError:
            # Redis лёг: пускаем без лимита, а не блокируем вход всем
            logger.exception("Лимит попыток не проверен: Redis недоступен")
            return
        if ttl > 0:
            raise TooManyAttemptsError(ttl)

    def register_failure(self, email: str) -> None:
        """Неверный пароль или код. Пятая неудача подряд включает паузу.

        Неудачи считаются подряд: счётчик живёт 15 минут с последней неудачи
        и обнуляется при успехе (reset).
        """
        failures, lock = self._keys(email)
        window = settings.auth_lock_minutes * 60
        try:
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
        except redis.RedisError:
            logger.exception("Неудачная попытка не учтена: Redis недоступен")

    def reset(self, email: str) -> None:
        """Успешная проверка — счётчик обнуляется. Сброс пароля админом снимает и паузу (Р-36)."""
        try:
            self.client.delete(*self._keys(email))
        except redis.RedisError:
            logger.exception("Счётчик попыток не сброшен: Redis недоступен")
