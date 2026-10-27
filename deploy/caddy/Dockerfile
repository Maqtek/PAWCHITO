# Прод-образ Caddy: собранный фронт + Caddyfile.
# Контекст сборки — корень репозитория (docker-compose.prod.yml); лишнее отсекает Dockerfile.dockerignore.

FROM node:24-alpine AS frontend

# pnpm той версии, что указана в packageManager в package.json
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ .

# Прод-сборка ходит в реальный API; моки MSW в ней и так не включаются (только import.meta.env.DEV)
ENV VITE_MOCKS=false
RUN pnpm build


FROM caddy:2-alpine

COPY deploy/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend /app/dist /srv/frontend
