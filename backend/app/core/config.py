"""Настройки приложения из переменных окружения.

В Docker переменные приходят из docker-compose (файл .env в корне репозитория).
Локально читаются из ../.env (корень) или .env (папка backend).
"""

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    # postgresql+psycopg2://ПОЛЬЗОВАТЕЛЬ:ПАРОЛЬ@ХОСТ:5432/БАЗА
    # в Docker ХОСТ — имя сервиса базы из docker-compose.yml, локально — localhost
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/pawchito"

    # redis://ХОСТ:6379/0; в Docker ХОСТ — имя сервиса Redis
    redis_url: str = "redis://localhost:6379/0"
    log_level: str = "INFO"
    log_stream: str = "logs"
    log_retention_days: int = 14

    timezone: str = "Europe/Moscow"

    # Секрет подписи JWT. Значения по умолчанию нет: без него приложение не стартует.
    jwt_secret: SecretStr = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    # Лимит неудачных попыток входа, восстановления и смены пароля
    auth_max_failures: int = 5
    auth_lock_minutes: int = 15

    # True — cookie только по HTTPS. http://localhost браузеры считают безопасным
    cookie_secure: bool = True


settings = Settings()
