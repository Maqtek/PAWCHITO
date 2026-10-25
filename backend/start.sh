#!/bin/sh
# Точка входа контейнера бэкенда: сначала миграции, потом команда запуска
# (CMD из Dockerfile или command из docker-compose.yml).
set -e
alembic upgrade head
exec "$@"
