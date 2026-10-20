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
