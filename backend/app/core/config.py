"""Настройки приложения из переменных окружения.

В Docker переменные приходят из docker-compose (файл .env в корне репозитория).
Локально читаются из ../.env (корень) или .env (папка backend).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    # postgresql+psycopg2://ПОЛЬЗОВАТЕЛЬ:ПАРОЛЬ@ХОСТ:5432/БАЗА
    # в Docker ХОСТ — имя сервиса базы из docker-compose.yml, локально — localhost
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/pawchito"


settings = Settings()
