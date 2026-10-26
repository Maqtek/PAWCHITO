"""Сид администратора и CLI сброса его пароля (#27)."""

from collections.abc import Callable, Iterator
from io import StringIO

import pytest
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app import cli, seed
from app.core.config import settings
from app.core.security import verify_password
from app.models import User, UserRole
from app.services.rate_limit import AttemptLimiter


@pytest.fixture(autouse=True)
def _same_transaction(
    db: Session, limiter: AttemptLimiter, monkeypatch: pytest.MonkeyPatch
) -> Iterator[None]:
    """Сид и CLI открывают сессию сами — подменяем фабрику на транзакцию теста."""
    factory = sessionmaker(bind=db.connection(), join_transaction_mode="create_savepoint")
    monkeypatch.setattr(seed, "SessionLocal", factory)
    monkeypatch.setattr(cli, "SessionLocal", factory)
    monkeypatch.setattr(cli, "redis_client", limiter.client)
    yield


def _admin_env(monkeypatch: pytest.MonkeyPatch, email: str | None, password: str | None) -> None:
    monkeypatch.setattr(settings, "admin_email", email)
    monkeypatch.setattr(settings, "admin_password", SecretStr(password) if password else None)


def _users(db: Session) -> list[User]:
    return list(db.scalars(select(User)))


class TestSeed:
    def test_without_env_only_warns(self, db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
        _admin_env(monkeypatch, None, None)
        assert seed.main() == 0
        assert _users(db) == []

    def test_creates_admin_once(self, db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
        _admin_env(monkeypatch, " Admin@Example.com ", "adminpass1")
        assert seed.main() == 0
        _admin_env(monkeypatch, "admin@example.com", "otherpass9")
        assert seed.main() == 0  # повторный запуск пароль не перезаписывает
        [admin] = _users(db)
        assert (admin.email, admin.role, admin.full_name) == (
            "admin@example.com",
            UserRole.admin,
            "Администратор",
        )
        assert verify_password("adminpass1", admin.password_hash)

    def test_does_not_promote_existing_user(
        self, db: Session, make_user: Callable[..., User], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        owner = make_user(email="admin@example.com")
        _admin_env(monkeypatch, "admin@example.com", "adminpass1")
        assert seed.main() == 0
        db.refresh(owner)
        assert owner.role == UserRole.owner

    def test_invalid_values_fail(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _admin_env(monkeypatch, "admin@example.com", "short")
        assert seed.main() == 1


class TestCli:
    def _reset(self, monkeypatch: pytest.MonkeyPatch, email: str, password: str) -> int:
        monkeypatch.setattr("sys.stdin", StringIO(password + "\n"))
        return cli.main(["reset-admin-password", email, "--password-stdin"])

    def test_resets_admin_password(
        self, db: Session, make_user: Callable[..., User], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        admin = make_user(UserRole.admin, email="admin@example.com")
        assert self._reset(monkeypatch, " ADMIN@example.com ", "  new pass  ") == 0
        db.refresh(admin)
        assert verify_password("  new pass  ", admin.password_hash)  # пробелы — часть пароля

    def test_only_admin(
        self, make_user: Callable[..., User], monkeypatch: pytest.MonkeyPatch, capsys
    ) -> None:
        make_user(UserRole.owner, email="owner@example.com")
        assert self._reset(monkeypatch, "owner@example.com", "newpass123") == 1
        assert "Администратора owner@example.com нет" in capsys.readouterr().err

    def test_short_password(
        self, make_user: Callable[..., User], monkeypatch: pytest.MonkeyPatch, capsys
    ) -> None:
        make_user(UserRole.admin, email="admin@example.com")
        assert self._reset(monkeypatch, "admin@example.com", "short") == 1
        assert "Пароль — не короче 8 символов" in capsys.readouterr().err
