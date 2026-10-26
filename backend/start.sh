#!/bin/sh
# Точка входа контейнера бэкенда: сначала миграции, потом команда запуска
# (CMD из Dockerfile или command из docker-compose.yml).
set -e
alembic upgrade head
# Администратор из ADMIN_EMAIL/ADMIN_PASSWORD; повторный запуск ничего не меняет
python -m app.seed
exec "$@"
