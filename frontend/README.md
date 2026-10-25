# PAWCHITO — фронтенд

React 19 + TypeScript + Vite. Стили — Tailwind 4, данные — TanStack Query и openapi-fetch, моки — MSW.

## Запуск

```bash
pnpm install
pnpm dev
```

Откройте http://localhost:5173. В разработке моки MSW отвечают на эндпоинты, для которых есть обработчики
в `src/mocks/handlers`; остальные запросы `/api` уходят в прокси Vite на `http://localhost:8000`,
а в консоли браузера появляется предупреждение MSW о запросе без мока.
Роль выбирается на экране входа (`/login`): «Выйти» в меню пользователя → «Моки: войти как».

### Настоящий бэкенд вместо моков

Запросы пойдут на `http://localhost:8000` через прокси Vite. Способ для любой ОС, включая Windows, —
создать `frontend/.env.local` (файл в `.gitignore`) и перезапустить `pnpm dev`:

```dotenv
VITE_API_MOCKS=false
```

Чтобы вернуть моки, удалите строку или файл. В bash/zsh можно и разово, без файла:

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

Витрина UI-кита в режиме разработки: http://localhost:5173/dev/ui — открывается после входа под любой ролью
моков (страница внутри кабинета, гостя перенаправит на `/login`).

## Устройство

- `src/api/schema.ts` — типы по `docs/Контракты_Pawchito.md`. Когда бэкенд отдаст `openapi.json`, файл заменяется генерацией `openapi-typescript`.
- `src/api/auth-token.ts` — access-токен, только в памяти (не в `localStorage`).
- `src/api/client.ts` — клиент openapi-fetch: подставляет токен и на 401 обновляет его через refresh-cookie, затем повторяет запрос.
- `src/mocks/` — моки по контрактам; новый эндпоинт → тип в `schema.ts` + обработчик в `mocks/handlers`.
- `src/components/ui/` — UI-кит; цвета и радиусы — только токены из `src/styles/index.css`.
- `src/lib/labels.ts` — подписи значений по глоссарию; в интерфейсе не пишем значения enum напрямую.
- `src/app/navigation.ts` — разделы по ролям (бизнес-правила, §11).
