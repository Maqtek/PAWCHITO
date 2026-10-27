#!/bin/sh
# Ежедневный бэкап (роадмап, этап 12): pg_dump базы и архив тома media, хранение 14 дней.
# Запускает таймер deploy/systemd/pawchito-backup.timer; руками — deploy/backup.sh.
# Где лежат файлы и как восстановить — deploy/README.md.
set -eu

APP_DIR=$(cd "$(dirname "$0")/.." && pwd)
BACKUP_DIR=${PAWCHITO_BACKUP_DIR:-/opt/pawchito-backups}
KEEP_DAYS=${PAWCHITO_BACKUP_KEEP_DAYS:-14}
MEDIA_VOLUME=${PAWCHITO_MEDIA_VOLUME:-pawchito_media}
# Тот же образ — в README для распаковки архива
TAR_IMAGE=alpine:3.22

die() {
  printf 'ОШИБКА: %s\n' "$*" >&2
  exit 1
}

case $KEEP_DAYS in '' | *[!0-9]*) die "PAWCHITO_BACKUP_KEEP_DAYS — число дней, а не «$KEEP_DAYS»" ;; esac

cd "$APP_DIR"
# В дампе вся база, включая хеши паролей: файлы читает только владелец
umask 077
mkdir -p "$BACKUP_DIR"

stamp=$(date +%Y-%m-%d_%H%M%S)
db_file="$BACKUP_DIR/db-$stamp.dump"
media_file="$BACKUP_DIR/media-$stamp.tar.gz"
# Пишем в .part и переименовываем: недописанный файл не выглядит бэкапом
trap 'rm -f "$db_file.part" "$media_file.part"' EXIT
trap 'exit 1' HUP INT TERM

# База первой: она важнее, и её бэкап не должен зависеть от тома media.
# Custom-формат (-Fc) уже сжат и восстанавливается pg_restore — целиком или по таблицам.
# $POSTGRES_* раскрываются в контейнере db, там они заданы из .env
# shellcheck disable=SC2016
docker compose -f docker-compose.prod.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$db_file.part"
[ -s "$db_file.part" ] || die "pg_dump вернул пустой файл"
mv "$db_file.part" "$db_file"

# Без проверки docker run молча создал бы пустой том — и пустой архив
docker volume inspect "$MEDIA_VOLUME" >/dev/null 2>&1 || die "нет тома $MEDIA_VOLUME"
docker run --rm --network none -v "$MEDIA_VOLUME:/media:ro" "$TAR_IMAGE" \
  tar -czf - -C /media . >"$media_file.part"
mv "$media_file.part" "$media_file"

ls -lh "$db_file" "$media_file"

# Старые удаляем только после удачного бэкапа: если бэкапы сломались, последние не пропадут.
# Сюда же попадают дампы перед деплоем (db-…-predeploy-….dump) и обрывки .part.
echo "Удаляем бэкапы старше $KEEP_DAYS дней:"
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'db-*.dump' -o -name 'media-*.tar.gz' -o -name '*.part' \) \
  -mmin +$((KEEP_DAYS * 24 * 60)) -print -delete
