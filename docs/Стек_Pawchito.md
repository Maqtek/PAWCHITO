# PAWCHITO — стек

| Слой | Выбор | Почему | Вместо |
|---|---|---|---|
| Бэкенд | Python, FastAPI, Pydantic | OpenAPI из кода — контракт для фронта; DI через `Depends` | Django — Active Record ломает слои; Flask — всё руками |
| ORM | SQLAlchemy 2 | модели отделены от API | SQLModel — смешивает модели БД и API |
| Миграции | Alembic | миграции из моделей, история схемы, откат | ручной SQL — нет истории и отката |
| БД | PostgreSQL | частичный индекс против двойной записи; ENUM, CHECK, массивы, представления | MySQL — нет частичных индексов; SQLite — один писатель |
| Авторизация | JWT (PyJWT): access на 15 минут + refresh на 30 дней с ротацией; Argon2 (pwdlib) | access проверяется без хранилища сессий, роль в токене; refresh в httpOnly-cookie недоступен JS и отзывается через БД | только access — нельзя отозвать; серверные сессии — обращение к хранилищу на каждый запрос; токен в localStorage — уязвим к XSS |
| Фронтенд | React, TypeScript, Vite | SPA за логином; типы из `openapi.json` | Next.js — SSR не нужен |
| Данные | TanStack Query, openapi-fetch | кэш и обновление после действий; типизированные запросы | Redux — избыточен |
| Моки | MSW | фронт не ждёт бэк | json-server — свои URL |
| Стили | Tailwind | токены UI-кита в одном месте | готовые UI-киты — чужой дизайн |
| Файлы | том Docker `media`, Pillow, python-multipart | одно фото на питомца: пережатие и удаление EXIF на сервере, без внешних сервисов | S3 / MinIO — избыточны для одного фото |
| Уведомления | таблица `notifications` + опрос раз в 60 секунд (`refetchInterval` в TanStack Query) | без новых сервисов и без WebSocket | WebSocket / SSE — сложнее, в первой версии не нужны |
| Тесты | pytest на PostgreSQL, ruff, mypy, eslint | ограничения БД — часть логики | SQLite в тестах — не те ограничения |
| Логи | Redis Streams | быстрая запись, автообрезка по сроку, лёгкий для VPS | Cassandra — JVM, не влезает в 2 ГБ RAM |
| Инфраструктура | Docker Compose, GitHub Actions, Caddy, VPS | запуск одной командой; CI на PR; HTTPS автоматически | Kubernetes — избыточен |

**Не берём:** Celery, WebSocket, микросервисы, GraphQL, S3 — в первой версии не нужны.

## Миграции (Alembic)

- `backend/alembic/`; `env.py` берёт URL БД из `.env`, `target_metadata = Base.metadata`.
- Миграции создаёт Пугно; один этап роадмапа — одна миграция.
- Цикл: модель → `alembic revision --autogenerate -m "…"` → вычитать и дописать → `alembic upgrade head` → модель и миграция в одном PR.
- Руками: представления (`op.execute`), CHECK, новые значения ENUM, переименования; проверить `postgresql_where` у частичного индекса.
- `naming_convention` в `MetaData`; влитые миграции не правим; одна голова; рабочий `downgrade`.
- Старт контейнера: `alembic upgrade head` → seed → uvicorn. На проде перед этим `pg_dump`.
- CI: миграции с нуля на чистом PostgreSQL + `alembic check`.

## Авторизация

- Access-токен — JWT на 15 минут: `sub`, `role`, `exp`. Передаётся в `Authorization: Bearer`, фронт хранит его только в памяти.
- Refresh-токен — случайная строка на 30 дней в cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`.
- В таблице `refresh_tokens` — хеш, срок, отметка об отзыве. При обмене выдаётся новый токен, старый отзывается. Повторное использование отозванного токена отзывает все токены пользователя.
- Пароли, коды восстановления и временные пароли клиник — Argon2.
- Фронт и API на одном origin, поэтому cookie работает без CORS:
  - на проде Caddy отдаёт фронт, проксирует `/api` на бэк и раздаёт `/media`;
  - в разработке `server.proxy` в Vite проксирует `/api` и `/media` на `http://localhost:8000`.

## Файлы (фото питомца)

- Загрузка — `multipart/form-data`. Тип проверяется по содержимому через Pillow, лимит — 5 МБ.
- Caddy ограничивает тело запроса (`request_body max_size`): `PUT /api/clinic/pets/*/photo` — 6 МБ (запас на обёртку multipart), остальной `/api` — 1 МБ; больше — `413`.
- Обработка: WebP, сторона до 1024 px, без EXIF; имя файла — случайный UUID.
- Хранение: том `media`, в контейнере бэкенда — `/srv/media`; каталог задаёт `MEDIA_DIR` (по умолчанию `media` относительно `backend/` — для запуска без Docker). Путь к файлу — в `pets.photo_path`.
- Раздача по `/media/<uuid>.webp`, адрес не угадать:
  - на проде — Caddy прямо из тома (только чтение), `Cache-Control` на год: у нового фото новое имя;
  - в разработке Caddy нет — бэкенд сам отдаёт `/media` из `MEDIA_DIR` (например, `StaticFiles`), Vite проксирует `/media` на бэкенд.
- Бэкап: том `media` архивируется вместе с ежедневным `pg_dump`.

## Прод (Caddy)

- `docker-compose.prod.yml`: `db`, `redis`, `backend`, `caddy`. Наружу открыт только Caddy — 80, 443 (TCP и UDP для HTTP/3).
- Caddy (`deploy/caddy/`): сертификат Let's Encrypt получает и продлевает сам; `/api/*` — на бэкенд, `/media/*` — из тома `media`, остальное — SPA (`index.html`). Фронт собирается в образе Caddy, отдельного сервиса нет.
- Заголовки: HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, запрет фреймов; сжатие zstd и gzip.
- Кэш: файлы сборки (`/assets`, хеш в имени) и фото — на год, `index.html` — `no-cache`, чтобы после деплоя сразу подхватывалась новая версия.
- Бэкенд за Caddy: uvicorn доверяет `X-Forwarded-*` (порт бэкенда наружу не открыт).

## Логирование (Redis)

- `logging` → `QueueHandler` → запись в Stream `logs` в фоновом потоке; запрос не ждёт Redis.
- Redis недоступен — логи идут в stdout, приложение работает.
- Поля: время, уровень, `request_id`, id пользователя, метод, путь, статус, время ответа, сообщение.
- Уровни: INFO — запросы и события (запись создана, приём завершён); WARNING — 403, 409; ERROR — 500 со стектрейсом.
- Хранение 14 дней (`XADD … MINID`), AOF, `maxmemory` 256 МБ.
- Не пишем: пароли, токены, коды восстановления, заключения, рецепты, содержимое файлов.
- Чтение: `XREVRANGE logs + - COUNT 50` или RedisInsight.
