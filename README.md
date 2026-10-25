# PAWCHITO

Цифровая медицинская карта и помощник по уходу за питомцем.

## Возможности

- **Владелец:** питомцы, здоровье и дневник, запись к врачу, дела по курсу лечения, календарь, уведомления на сайте.
- **Клиника:** записи, итог приёма (заключение, рецепты, прививки, статус ухода, данные и фото питомца), врачи и отпуска.
- **Администратор:** клиники, их аккаунты и сброс паролей.

Сервис не ставит диагнозы — медицинские решения принимает врач.

Требования разделены на MVP (первый релиз) и расширенную версию — см. [Требования](docs/Требования_Pawchito.md).

## Стек

- **Бэкенд:** Python, FastAPI, Pydantic, SQLAlchemy 2, Alembic
- **Фронтенд:** React, TypeScript, Vite, TanStack Query, Tailwind
- **Базы данных:** PostgreSQL — данные, Redis — логи
- **Инфраструктура:** Docker Compose, GitHub Actions, Caddy

## Структура

```
backend/    FastAPI: routers → services → repositories → models
frontend/   React + TypeScript
docs/       требования, бизнес-правила, глоссарий, роадмап, стек, контракты API, журнал решений
```

## Запуск

```bash
cp .env.example .env
# в .env заполнить JWT_SECRET — сгенерировать можно так:
docker run --rm python:3.12-slim python -c "import secrets; print(secrets.token_urlsafe(64))"
docker compose up --build
```

| Сервис | Адрес |
|---|---|
| Фронтенд | http://localhost:5173 |
| API и Swagger | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

Фронтенд в Docker по умолчанию работает на моках MSW; чтобы запросы шли на бэкенд — `VITE_API_MOCKS=false` в `.env`.

Миграции применяются при старте бэкенда.

## Команды

| Что | Команда |
|---|---|
| Применить миграции | `docker compose exec backend alembic upgrade head` |
| Новая миграция | `docker compose exec backend alembic revision --autogenerate -m "..."` |
| Тесты бэкенда | `docker compose exec backend pytest` |
| Логи | `docker compose exec redis redis-cli XREVRANGE logs + - COUNT 50` |

## CI

GitHub Actions (`.github/workflows/ci.yml`) на каждый PR и на push в `main`:

- бэкенд — `ruff check`, `ruff format --check`, `mypy app`, `pytest`; миграции с нуля и `alembic check` — как только в бэкенде появится Alembic (#10);
- фронтенд — `pnpm lint`, `pnpm test`, `pnpm build`;
- сборка образов `backend` и `frontend`.

Чтобы PR с красным CI нельзя было слить, проверки нужно отметить обязательными в защите `main` (Settings → Branches; делает администратор репозитория).

## Правила

- Ветка на задачу → PR с ревью → зелёный CI → `main`. Прямые пуши запрещены.
- Схема БД меняется только миграциями Alembic, через Пугно Д.В.
- API меняется вместе с `openapi.json`.

## Команда

| Участник | Зона |
|---|---|
| Вдовин М.Э. | тимлид, back |
| Пугно Д.В. | back, БД |
| Еременко Н.А. | PM, front, дизайн |
| Черников А.С. | front, devops, аналитика |

## Документация

- [Бизнес-требования](docs/BRD.md)
- [Требования](docs/Требования_Pawchito.md)
- [Бизнес-правила](docs/Бизнес-правила_Pawchito.md)
- [Глоссарий](docs/Глоссарий_Pawchito.md)
- [Роадмап](docs/Роадмап_Pawchito.md)
- [Стек](docs/Стек_Pawchito.md)
- [Контракты API](docs/Контракты_Pawchito.md)
- [Журнал решений](docs/Решения_Pawchito.md)
- [Use case диаграмма](docs/usecases.pdf)
