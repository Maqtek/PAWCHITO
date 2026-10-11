# PAWCHITO — стек

| Слой | Выбор | Почему | Вместо |
|---|---|---|---|
| Бэкенд | Python, FastAPI, Pydantic | OpenAPI из кода — контракт для фронта; DI через `Depends` | Django — Active Record ломает слои; Flask — всё руками |
| ORM | SQLAlchemy 2 | модели отделены от API | SQLModel — смешивает модели БД и API |
| Миграции | Alembic | миграции из моделей, история схемы, откат | ручной SQL — нет истории и отката |
| БД | PostgreSQL | частичный индекс против двойной записи; ENUM, CHECK, массивы, представления | MySQL — нет частичных индексов; SQLite — один писатель |
| Авторизация | JWT (PyJWT), Argon2 (pwdlib) | без хранилища сессий; роль в токене | сессии — хранилище и защита от CSRF |
| Фронтенд | React, TypeScript, Vite | SPA за логином; типы из `openapi.json` | Next.js — SSR не нужен |
| Данные | TanStack Query, openapi-fetch | кэш и обновление после действий; типизированные запросы | Redux — избыточен |
| Моки | MSW | фронт не ждёт бэк | json-server — свои URL |
| Стили | Tailwind | токены UI-кита в одном месте | готовые UI-киты — чужой дизайн |
| Тесты | pytest на PostgreSQL, ruff, mypy, eslint | ограничения БД — часть логики | SQLite в тестах — не те ограничения |
| Логи | Redis Streams | быстрая запись, автообрезка по сроку, лёгкий для VPS | Cassandra — JVM, не влезает в 2 ГБ RAM |
| Инфраструктура | Docker Compose, GitHub Actions, Caddy, VPS | запуск одной командой; CI на PR; HTTPS автоматически | Kubernetes — избыточен |

**Не берём:** Celery, WebSocket, микросервисы, GraphQL — в первой версии не нужны.

## Миграции (Alembic)

- `backend/alembic/`; `env.py` берёт URL БД из `.env`, `target_metadata = Base.metadata`.
- Миграции создаёт Пугно; один этап роадмапа — одна миграция.
- Цикл: модель → `alembic revision --autogenerate -m "…"` → вычитать и дописать → `alembic upgrade head` → модель и миграция в одном PR.
- Руками: представления (`op.execute`), CHECK, новые значения ENUM, переименования; проверить `postgresql_where` у частичного индекса.
- `naming_convention` в `MetaData`; влитые миграции не правим; одна голова; рабочий `downgrade`.
- Старт контейнера: `alembic upgrade head` → seed → uvicorn. На проде перед этим `pg_dump`.
- CI: миграции с нуля на чистом PostgreSQL + `alembic check`.

## Логирование (Redis)

- `logging` → `QueueHandler` → запись в Stream `logs` в фоновом потоке; запрос не ждёт Redis.
- Redis недоступен — логи идут в stdout, приложение работает.
- Поля: время, уровень, `request_id`, id пользователя, метод, путь, статус, время ответа, сообщение.
- Уровни: INFO — запросы и события (запись создана, приём завершён); WARNING — 403, 409; ERROR — 500 со стектрейсом.
- Хранение 14 дней (`XADD … MINID`), AOF, `maxmemory` 256 МБ.
- Не пишем: пароли, токены, заключения, рецепты.
- Чтение: `XREVRANGE logs + - COUNT 50` или RedisInsight.
