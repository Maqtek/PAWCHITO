# PAWCHITO — деплой и бэкапы

Прод — один VPS: Docker Compose (`docker-compose.prod.yml`, проект `pawchito`). Код — клон `main` в `/opt/pawchito`, бэкапы — в `/opt/pawchito-backups`.

| Файл | Что делает |
|---|---|
| `deploy.sh` | деплой на сервере: код → `pg_dump` → сборка → `alembic upgrade head` → перезапуск |
| `backup.sh` | бэкап: `pg_dump` и архив тома `media`, хранение 14 дней |
| `systemd/pawchito-backup.{service,timer}` | `backup.sh` каждую ночь в 03:30 по Москве |
| `../.github/workflows/deploy.yml` | `deploy.sh` по SSH после зелёного CI в `main` |

## Подготовка VPS

Ubuntu 24.04 LTS, от 2 ГБ RAM. Под администратором с sudo:

```bash
# Docker Engine с плагином compose — по https://docs.docker.com/engine/install/ubuntu/
sudo timedatectl set-timezone Europe/Moscow

# Пользователь для деплоя: вход только по ключу, Docker без sudo
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy -m 755 /opt/pawchito
sudo install -d -o deploy -g deploy -m 700 /opt/pawchito-backups

# Файрвол: SSH, HTTP (выпуск сертификата и редирект на HTTPS), HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

- Группа `docker` даёт права root: в ней только `deploy`, его ключ — только у GitHub Actions.
- Docker открывает опубликованные порты в обход `ufw`, поэтому наружу в `docker-compose.prod.yml` смотрит только `caddy`.
- DNS: A-запись (и AAAA, если есть IPv6) домена из `DOMAIN` → IP сервера. Caddy выпустит сертификат при первом запуске, если домен уже указывает на сервер и порты 80/443 открыты.

## Первый запуск

Под `deploy` (`sudo -iu deploy`):

```bash
git clone https://github.com/Maqtek/PAWCHITO.git /opt/pawchito
cd /opt/pawchito
cp .env.example .env
chmod 600 .env
# заполнить .env по комментариям: пароль БД, JWT_SECRET, DOMAIN, ACME_EMAIL, ADMIN_*
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Если репозиторий приватный, сервер забирает код по SSH ключом только на чтение: `ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519`, открытый ключ — в Settings → Deploy keys без «Allow write access», клон — `git@github.com:Maqtek/PAWCHITO.git`. При первом подключении сверить отпечаток github.com с опубликованным в документации GitHub.

Код на сервере руками не правим: деплой делает `git reset --hard`. Настройки — только в `.env`.

## Секреты GitHub

Делает администратор репозитория.

1. Settings → Environments → New environment → `production`. В Deployment branches and tags оставить только `main`. По желанию — Required reviewers: тогда каждый деплой ждёт подтверждения.
2. Ключ для входа на сервер — на своей машине: `ssh-keygen -t ed25519 -N "" -C github-deploy -f pawchito_deploy`. Открытый ключ — строкой `restrict ssh-ed25519 AAAA… github-deploy` в `/home/deploy/.ssh/authorized_keys` (каталог 700, файл 600, владелец `deploy`); `restrict` запрещает проброс портов и терминал.
3. Строка known_hosts: `ssh-keyscan -p ПОРТ СЕРВЕР`. Отпечаток (`ssh-keyscan СЕРВЕР | ssh-keygen -lf -`) сверить с выводом `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` на сервере.
4. Секреты окружения `production`:

| Секрет | Значение |
|---|---|
| `DEPLOY_HOST` | IP или имя сервера |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_PORT` | порт SSH, если не 22; иначе не заводить |
| `DEPLOY_SSH_KEY` | закрытый ключ `pawchito_deploy` целиком; локальную копию потом удалить |
| `DEPLOY_KNOWN_HOSTS` | вывод `ssh-keyscan` из шага 3 |

5. Включить деплой: Settings → Secrets and variables → Actions → Variables → New repository variable `DEPLOY_ENABLED` со значением `true`. Без неё `deploy.yml` пропускается — и после CI, и при ручном запуске: пока сервера нет, workflow не падает на каждом push в `main`. Выключить деплой — удалить переменную или поставить другое значение.

Проверка — Actions → Deploy → Run workflow на `main`.

## Деплой

`deploy.yml` при `DEPLOY_ENABLED=true` запускается после успешного CI на push в `main` и вручную (Run workflow, только `main`). Деплои идут по одному, начатый не прерывается. На сервере выполняется `deploy/deploy.sh <коммит>`:

1. `git fetch` и `git reset --hard` на коммит — только из `main`. Дальше работает уже новая версия скрипта.
2. `pg_dump` в `/opt/pawchito-backups/db-…-predeploy-<коммит>.dump`.
3. `docker compose build`.
4. `alembic upgrade head` отдельным контейнером. Упавшая миграция откатывается целиком (одна транзакция), старая версия продолжает работать.
5. `docker compose up -d --remove-orphans`.
6. Ждёт, пока `backend` станет healthy.
7. `docker image prune` — висячие образы.

При ошибке — ненулевой код, красная джоба, в логе шаг, путь к дампу и команда отката.

Руками на сервере: `deploy/deploy.sh` — свежий `main`, `deploy/deploy.sh ХЕШ` — конкретный коммит из `main`.

| Переменная | По умолчанию | Что |
|---|---|---|
| `PAWCHITO_BACKUP_DIR` | `/opt/pawchito-backups` | куда класть дампы и архивы |
| `PAWCHITO_HEALTH_TIMEOUT` | `120` | сколько секунд ждать healthy у `backend` |
| `PAWCHITO_BACKUP_KEEP_DAYS` | `14` | сколько дней хранить бэкапы |
| `PAWCHITO_MEDIA_VOLUME` | `pawchito_media` | том с фото |

## Бэкапы

Установка таймера — один раз и после изменений в `deploy/systemd/`:

```bash
sudo cp /opt/pawchito/deploy/systemd/pawchito-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pawchito-backup.timer
sudo systemctl start pawchito-backup.service   # первый бэкап сразу — проверить
systemctl list-timers pawchito-backup.timer     # следующий запуск
journalctl -u pawchito-backup.service           # лог
```

systemd, а не cron: лог в journald, упавший бэкап виден в `systemctl --failed`, пропущенный из-за выключенного сервера выполняется при старте (`Persistent=true`).

Файлы в `/opt/pawchito-backups`:

| Файл | Что |
|---|---|
| `db-ГГГГ-ММ-ДД_ЧЧММСС.dump` | ночной `pg_dump` |
| `media-ГГГГ-ММ-ДД_ЧЧММСС.tar.gz` | ночной архив тома `pawchito_media` |
| `db-…-predeploy-<коммит>.dump` | дамп перед деплоем |

- Формат дампа — custom (`pg_dump -Fc`), а не plain SQL: уже сжат, `pg_restore` грузит его одной транзакцией, показывает содержимое (`pg_restore -l`) и умеет отдельные таблицы.
- Файл пишется во временный `.part` и переименовывается: недописанный не выглядит бэкапом. Читать может только владелец.
- Файлы старше 14 дней удаляются после удачного бэкапа: если бэкапы сломались, последние не пропадут.
- Бэкапы лежат на том же VPS и не спасут при потере сервера — периодически копировать их на другую машину (`rsync`, `scp`).

## Восстановление базы

База пересоздаётся из дампа: всё, что записано после дампа, пропадёт. Из `/opt/pawchito`:

```bash
docker compose -f docker-compose.prod.yml stop backend
docker compose -f docker-compose.prod.yml exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --single-transaction --no-owner' < /opt/pawchito-backups/db-ДАТА.dump
docker compose -f docker-compose.prod.yml start backend
```

При старте `backend` применит миграции новее дампа. При откате деплоя последнюю команду не выполнять — см. «Откат».

## Восстановление тома media

```bash
docker compose -f docker-compose.prod.yml stop backend
docker run --rm -v pawchito_media:/media -v /opt/pawchito-backups:/backup:ro alpine:3.22 \
  sh -c 'find /media -mindepth 1 -delete && tar -xzf /backup/media-ДАТА.tar.gz -C /media'
docker compose -f docker-compose.prod.yml start backend
```

Базу и `media` восстанавливаем из одной ночи: пути к фото хранятся в базе.

## Откат

Если деплой упал, в логе — шаг, прежний коммит и путь к дампу. На сервере из `/opt/pawchito`:

1. Только если в логе «Новые миграции уже применены»: вернуть базу из `…-predeploy-….dump` — первые три команды из «Восстановление базы», без `start backend`, иначе новый код снова применит миграции.
2. `deploy/deploy.sh ПРЕЖНИЙ_ХЕШ` — соберёт и запустит прежнюю версию.

Исправление — обычным PR в `main`: после зелёного CI оно задеплоится само.

## Логи

- Логи приложения — в Redis Stream `logs`. Записи старше 14 дней бэкенд обрезает сам (`XADD … MINID`, `LOG_RETENTION_DAYS`), в бэкап логи не входят.
- Смотреть: `docker compose -f docker-compose.prod.yml exec redis redis-cli XREVRANGE logs + - COUNT 50`.
- Вывод контейнера: `docker compose -f docker-compose.prod.yml logs --tail 100 backend`.
- Лог деплоя — в GitHub Actions, лог бэкапа — `journalctl -u pawchito-backup.service`.
