# PAWCHITO — фронтенд

React 19 + TypeScript + Vite. Стили — Tailwind 4, данные — TanStack Query и openapi-fetch, моки — MSW.

## Запуск

```bash
pnpm install
pnpm dev
```

Откройте http://localhost:5173. В разработке все запросы `/api` перехватывают моки MSW.
Роль выбирается на экране входа (`/login`): «Выйти» в меню пользователя → «Моки: войти как».

Работа с настоящим бэкендом (`http://localhost:8000` через прокси Vite):

```bash
VITE_API_MOCKS=false pnpm dev
```

## Команды

| Команда | Что делает |
|---|---|
| `pnpm dev` | дев-сервер |
| `pnpm test` | тесты Vitest |
| `pnpm lint` | ESLint |
| `pnpm build` | проверка типов и сборка |

Витрина UI-кита в режиме разработки: http://localhost:5173/dev/ui

## Устройство

- `src/api/schema.ts` — типы по `docs/Контракты_Pawchito.md`. Когда бэкенд отдаст `openapi.json`, файл заменяется генерацией `openapi-typescript`.
- `src/api/client.ts` — access-токен в памяти, обновление по 401 через refresh-cookie.
- `src/mocks/` — моки по контрактам; новый эндпоинт → тип в `schema.ts` + обработчик в `mocks/handlers`.
- `src/components/ui/` — UI-кит; цвета и радиусы — только токены из `src/styles/index.css`.
- `src/lib/labels.ts` — подписи значений по глоссарию; в интерфейсе не пишем значения enum напрямую.
- `src/app/navigation.ts` — разделы по ролям (бизнес-правила, §11).
