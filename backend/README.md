# BACKEND

FastAPI: `routers → services → repositories → models`.

## База данных

| Файл | Что в нём |
|---|---|
| `app/core/config.py` | настройки из `.env` (`DATABASE_URL`) |
| `app/db/session.py` | подключение, сессия, `get_db` — одна транзакция на запрос |
| `app/models/base.py` | `Base` с `naming_convention`, миксины `IdMixin`, `CreatedAtMixin` |
| `app/repositories/base.py` | `BaseRepository`: `create`, `get`, `list`, `update`, `delete` |
| `alembic/` | миграции; `0001` — начальная пустая ревизия |
| `start.sh` | `alembic upgrade head` при старте контейнера, затем запуск сервера |

`DATABASE_URL` в `.env`:

```
DATABASE_URL=postgresql+psycopg2://ПОЛЬЗОВАТЕЛЬ:ПАРОЛЬ@db:5432/pawchito
```

`db` — имя сервиса PostgreSQL в `docker-compose.yml` (локально без Docker — `localhost`).

## Миграции

- Один этап роадмапа — одна миграция. Создаёт их ответственный за БД — так в истории не появятся две «головы».
- `alembic revision --autogenerate -m "..."` → **вычитать файл** → `alembic upgrade head` → модель и миграция в одном PR.
- Руками дописываем: представления (`op.execute`), удаление ENUM-типов в `downgrade`, переименования, `postgresql_where` у частичных индексов.
- Влитые миграции не правим. В истории одна голова. `downgrade` должен работать.

## Логи

| Файл | Что в нём |
|---|---|
| `app/core/logging.py` | JSON-записи в Redis Stream `logs` через фоновый поток; без Redis — stdout |
| `app/core/middleware.py` | `request_id` на каждый запрос, заголовок `X-Request-ID`, лог итога запроса |

`REDIS_URL` в `.env` (по умолчанию `redis://localhost:6379/0`). Смотреть логи:

    docker compose exec redis redis-cli XREVRANGE logs + - COUNT 50
