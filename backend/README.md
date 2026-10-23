# BACKEND

FastAPI: `routers → services → repositories → models`.

## База данных

| Файл | Что в нём |
|---|---|
| `app/core/config.py` | настройки из `.env` (`DATABASE_URL`) |
| `app/db/session.py` | подключение, сессия, `get_db` — одна транзакция на запрос |
| `app/models/base.py` | `Base` с `naming_convention`, миксины `IdMixin`, `CreatedAtMixin` |
| `app/repositories/base.py` | `BaseRepository`: `create`, `get`, `list`, `update`, `delete` |

`DATABASE_URL` в `.env`:

```
DATABASE_URL=postgresql+psycopg2://ПОЛЬЗОВАТЕЛЬ:ПАРОЛЬ@db:5432/pawchito
```

`db` — имя сервиса PostgreSQL в `docker-compose.yml` (локально без Docker — `localhost`).

## Логи

| Файл | Что в нём |
|---|---|
| `app/core/logging.py` | JSON-записи в Redis Stream `logs` через фоновый поток; без Redis — stdout |
| `app/core/middleware.py` | `request_id` на каждый запрос, заголовок `X-Request-ID`, лог итога запроса |

`REDIS_URL` в `.env` (по умолчанию `redis://localhost:6379/0`). Смотреть логи:

    docker compose exec redis redis-cli XREVRANGE logs + - COUNT 50
