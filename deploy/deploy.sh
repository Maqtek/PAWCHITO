#!/bin/sh
# Деплой на сервере (роадмап, этап 12): код → pg_dump → сборка → alembic upgrade head → перезапуск.
# Запуск из клона в /opt/pawchito: deploy/deploy.sh [коммит]; без коммита — свежий origin/main.
# Вызывает .github/workflows/deploy.yml по SSH; руками — для повтора и отката (deploy/README.md).
set -eu

APP_DIR=$(cd "$(dirname "$0")/.." && pwd)
BACKUP_DIR=${PAWCHITO_BACKUP_DIR:-/opt/pawchito-backups}
HEALTH_TIMEOUT=${PAWCHITO_HEALTH_TIMEOUT:-120}
COMPOSE_FILE=docker-compose.prod.yml

log() { printf '\n==> %s\n' "$*"; }
die() {
  printf 'ОШИБКА: %s\n' "$*" >&2
  exit 1
}
compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# Шаг 1 — код. Скрипт сам лежит в репозитории, поэтому после обновления
# перезапускаемся его новой версией: правки деплоя действуют в том же релизе.
update_code() {
  if [ -n "$1" ]; then
    # Аргумент приходит по SSH: пропускаем только хеш
    case $1 in *[!0-9a-f]*) die "нужен хеш коммита, а не «$1»" ;; esac
  fi
  prev=$(git rev-parse HEAD)
  git fetch --prune --quiet origin
  target=$(git rev-parse --verify --quiet "${1:-origin/main}^{commit}") ||
    die "коммит ${1:-origin/main} не найден"
  # В main попадает только то, что прошло ревью и CI
  git merge-base --is-ancestor "$target" origin/main ||
    die "коммит $target не из main"
  log "Код: $(git rev-parse --short "$prev") → $(git rev-parse --short "$target")"
  git reset --hard --quiet "$target"
  export PAWCHITO_DEPLOY_PREV="$prev"
  exec sh "$APP_DIR/deploy/deploy.sh" "$target"
}

wait_healthy() {
  id=$(compose ps -q backend)
  [ -n "$id" ] || die "контейнер backend не запущен"
  deadline=$(($(date +%s) + HEALTH_TIMEOUT))
  while :; do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")
    case $status in
      healthy) return 0 ;;
      running)
        # Статус running бывает только у контейнера без healthcheck
        echo "у backend нет healthcheck — проверено только, что контейнер запущен"
        return 0
        ;;
    esac
    [ "$(date +%s)" -lt "$deadline" ] ||
      die "backend не стал healthy за $HEALTH_TIMEOUT с (статус: $status)"
    sleep 5
  done
}

# Подсказка по откату: что уже изменилось, зависит от шага, на котором упали.
# Вызывается из trap, shellcheck этого не видит.
# shellcheck disable=SC2329
on_exit() {
  rc=$?
  rm -f "$dump.part"
  [ "$rc" -ne 0 ] || return 0
  {
    printf '\nДеплой %s не удался на шаге «%s».\n' "$short" "$stage"
    if [ "$stage" = перезапуск ] || [ "$stage" = проверка ]; then
      if ! git diff --quiet "$prev" "$target" -- backend/alembic/versions; then
        printf 'Новые миграции уже применены: сначала вернуть базу из %s\n' "$dump"
        printf '(deploy/README.md, «Восстановление базы»).\n'
      fi
    fi
    printf 'Откат на прежний коммит: cd %s && deploy/deploy.sh %s\n' "$APP_DIR" "$prev"
    printf 'Логи: docker compose -f %s logs --tail 100 backend\n' "$COMPOSE_FILE"
  } >&2
}

# Шаги 2–7 — уже новой версией скрипта
deploy() {
  target=$1
  prev=$PAWCHITO_DEPLOY_PREV
  short=$(git rev-parse --short "$target")
  dump="$BACKUP_DIR/db-$(date +%Y-%m-%d_%H%M%S)-predeploy-$short.dump"
  stage=pg_dump
  trap on_exit EXIT

  log "pg_dump перед миграциями"
  # В дампе вся база, включая хеши паролей: файлы читает только владелец
  umask 077
  mkdir -p "$BACKUP_DIR"
  # $POSTGRES_* раскрываются в контейнере db, там они заданы из .env
  # shellcheck disable=SC2016
  compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$dump.part"
  [ -s "$dump.part" ] || die "pg_dump вернул пустой файл"
  mv "$dump.part" "$dump"
  echo "$dump"

  stage=сборка
  log "Сборка образов"
  compose build

  stage=миграции
  log "alembic upgrade head"
  # До перезапуска и отдельным контейнером: упавшая миграция откатывается целиком
  # (одна транзакция, backend/alembic/env.py), а старая версия продолжает работать.
  # --entrypoint — мимо start.sh с сидом; --no-deps — db уже запущена, остальное ждёт up
  compose run --rm --no-deps --entrypoint alembic backend upgrade head

  stage=перезапуск
  log "Перезапуск"
  compose up -d --remove-orphans

  stage=проверка
  log "Ждём healthy у backend (до $HEALTH_TIMEOUT с)"
  wait_healthy

  log "Удаляем висячие образы"
  # Старые слои после пересборки; ошибка здесь деплой не отменяет
  docker image prune -f || echo "не удалось удалить висячие образы"

  log "Готово: $(git log -1 --format='%h %s')"
}

main() {
  cd "$APP_DIR"
  # Без интерактива: git не должен ждать пароль
  export GIT_TERMINAL_PROMPT=0
  if [ -z "${PAWCHITO_DEPLOY_PREV:-}" ]; then
    update_code "${1:-}"
  else
    deploy "$1"
  fi
}

# Одной строкой: shell дочитывает файл по ходу, а git reset заменяет его на диске
main "$@"; exit
