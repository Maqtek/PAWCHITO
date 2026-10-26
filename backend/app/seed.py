"""Начальные данные: администратор из ADMIN_EMAIL и ADMIN_PASSWORD.

    python -m app.seed

Запускается после `alembic upgrade head` (в Docker — из start.sh при каждом старте).
Повторный запуск безопасен: если пользователь с таким email уже есть, ничего не меняется,
пароль не перезаписывается. Сменить пароль администратора — python -m app.cli.
"""

import logging
import sys

from app.core.config import settings
from app.core.security import hash_password
from app.core.validation import validate_value
from app.db.session import SessionLocal
from app.models import UserRole
from app.repositories.user import UserRepository
from app.schemas.fields import NewEmail, NewPassword

logger = logging.getLogger("app.seed")

ADMIN_FULL_NAME = "Администратор"


def seed_admin() -> None:
    if not settings.admin_email or settings.admin_password is None:
        logger.warning("ADMIN_EMAIL или ADMIN_PASSWORD не заданы — администратор не создан")
        return
    # Те же правила, что при регистрации: неверные значения — ошибка, а не тихий пропуск
    email = validate_value(NewEmail, settings.admin_email, "email")
    password = validate_value(NewPassword, settings.admin_password.get_secret_value(), "password")

    with SessionLocal.begin() as session:
        users = UserRepository(session)
        existing = users.get_by_email(email)
        if existing is not None:
            if existing.role != UserRole.admin:
                # Email успели занять, например регистрацией владельца. Роль не меняем:
                # иначе администратором стал бы тот, кто зарегистрировался первым
                logger.warning(
                    "Email %s занят пользователем с ролью %s — администратор не создан",
                    email,
                    existing.role.value,
                )
            else:
                logger.info("Администратор %s уже есть — ничего не меняем", email)
            return
        users.create(
            email=email,
            password_hash=hash_password(password),
            role=UserRole.admin,
            full_name=ADMIN_FULL_NAME,
        )
    logger.info("Создан администратор %s", email)


def main() -> int:
    # Свой простой вывод: сид работает без FastAPI и без логов в Redis
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    try:
        seed_admin()
    except ValueError as exc:
        logger.error("Неверные ADMIN_EMAIL или ADMIN_PASSWORD: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
