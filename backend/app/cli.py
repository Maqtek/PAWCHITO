"""Команды бэкенда для сервера — то, чего нет в API.

    python -m app.cli reset-admin-password admin@example.com
    printf '%s\n' "$PASSWORD" | python -m app.cli reset-admin-password EMAIL --password-stdin

В Docker: docker compose exec backend python -m app.cli reset-admin-password admin@example.com
"""

import argparse
import getpass
import sys

from app.core.redis import redis_client
from app.core.validation import validate_value
from app.db.session import SessionLocal
from app.models import UserRole
from app.repositories.user import UserRepository
from app.schemas.fields import LoginEmail, NewPassword
from app.services.auth import AuthService
from app.services.rate_limit import AttemptLimiter


class CliError(Exception):
    """Ошибка для человека у терминала: текст в stderr, код выхода 1."""


def _read_password(from_stdin: bool) -> str:
    # Пароль не берём из аргументов: он остался бы в истории шелла и в списке процессов
    if from_stdin:
        return sys.stdin.readline().rstrip("\r\n")  # пробелы — часть пароля, их не трогаем
    password = getpass.getpass("Новый пароль: ")
    if getpass.getpass("Повторите пароль: ") != password:
        raise CliError("Пароли не совпадают")
    return password


def reset_admin_password(args: argparse.Namespace) -> None:
    """Пароль администратора сбрасывается только здесь, через API — нет (БП §1)."""
    try:
        email = validate_value(LoginEmail, args.email, "email")
        password = validate_value(NewPassword, _read_password(args.password_stdin), "password")
    except ValueError as exc:
        raise CliError(str(exc)) from None
    with SessionLocal.begin() as session:
        user = UserRepository(session).get_by_email(email)
        # Только администратор: владелец восстанавливает доступ кодом,
        # клинике пароль сбрасывает админ
        if user is None or user.role != UserRole.admin:
            raise CliError(f"Администратора {email} нет")
        AuthService(session, AttemptLimiter(redis_client)).reset_password(user, password)
    print(f"Пароль администратора {email} изменён, все его сессии завершены")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)

    reset = commands.add_parser("reset-admin-password", help="задать новый пароль администратора")
    reset.add_argument("email", help="email администратора")
    reset.add_argument(
        "--password-stdin", action="store_true", help="прочитать пароль из stdin, а не спрашивать"
    )
    reset.set_defaults(handler=reset_admin_password)

    args = parser.parse_args(argv)
    try:
        args.handler(args)
    except CliError as exc:
        print(f"Ошибка: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
