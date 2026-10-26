"""Общая инфраструктура тестов.

- Своя база: имя рабочей + `_test` (pawchito → pawchito_test) или TEST_DATABASE_URL.
  Создаётся при первом запуске, схема накатывается `alembic upgrade head` один раз за запуск.
  Данные разработки тесты не видят и не трогают.
- Каждый тест идёт в своей транзакции и откатывается: get_db подменён на сессию
  в SAVEPOINT, поэтому тестовая база всегда пустая.
- Лимит попыток — в отдельной базе Redis (номер 15), она чистится перед каждым тестом.
- Клиент ходит на https://test: cookie с Secure по http клиент не сохранил бы.
"""

import os
from collections.abc import Callable, Iterator

import httpx2 as httpx
import pytest
import redis
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import URL, Engine, create_engine, make_url, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.session import ENGINE_CONNECT_ARGS, get_db
from app.main import app
from app.models import User, UserRole
from app.routers.deps import get_attempt_limiter
from app.services.rate_limit import AttemptLimiter

PASSWORD = "secret123"
TEST_REDIS_DB = 15

ClientFactory = Callable[..., TestClient]


def _test_database_url() -> URL:
    if url := os.environ.get("TEST_DATABASE_URL"):
        return make_url(url)
    url = make_url(settings.database_url)
    return url.set(database=f"{url.database}_test")


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    url = _test_database_url()
    # Служебная база postgres есть всегда — из неё создаём тестовую, если её ещё нет
    server = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with server.connect() as conn:
        exists = conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": url.database}
        )
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    server.dispose()

    config = Config("alembic.ini")
    # env.py берёт адрес отсюда, если он задан, а не из DATABASE_URL
    config.set_main_option(
        "sqlalchemy.url", url.render_as_string(hide_password=False).replace("%", "%%")
    )
    command.upgrade(config, "head")

    test_engine = create_engine(url, connect_args=ENGINE_CONNECT_ARGS)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """Сессия на внешней транзакции: всё, что тест записал, в конце откатывается."""
    connection = engine.connect()
    transaction = connection.begin()
    # create_savepoint: commit внутри приложения закрывает только SAVEPOINT
    session = Session(
        bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
    )
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def limiter() -> Iterator[AttemptLimiter]:
    client = redis.Redis.from_url(settings.redis_url, db=TEST_REDIS_DB, decode_responses=True)
    client.flushdb()
    yield AttemptLimiter(client)
    client.flushdb()
    client.close()


@pytest.fixture
def client_factory(db: Session, limiter: AttemptLimiter) -> Iterator[ClientFactory]:
    """Новый клиент — как отдельное устройство: у каждого свои cookie."""

    def override_get_db() -> Iterator[Session]:
        # Как настоящий get_db, только вместо COMMIT/ROLLBACK — SAVEPOINT на время запроса:
        # успех — RELEASE, ошибка — откат к SAVEPOINT. Данные фабрик теста при этом видны.
        with db.begin_nested():
            yield db

    touched: list[FastAPI] = []

    def make(target: FastAPI = app) -> TestClient:
        target.dependency_overrides[get_db] = override_get_db
        target.dependency_overrides[get_attempt_limiter] = lambda: limiter
        touched.append(target)
        return TestClient(target, base_url="https://test")

    yield make
    for target in touched:
        target.dependency_overrides.clear()


@pytest.fixture
def client(client_factory: ClientFactory) -> TestClient:
    return client_factory()


@pytest.fixture
def make_user(db: Session) -> Callable[..., User]:
    counter = iter(range(1, 1_000_000))

    def make(
        role: UserRole = UserRole.owner,
        *,
        is_active: bool = True,
        must_change_password: bool = False,
        email: str | None = None,
        password: str = PASSWORD,
    ) -> User:
        user = User(
            email=email or f"{role.value}{next(counter)}@example.com",
            password_hash=hash_password(password),
            role=role,
            full_name=f"Тестовый {role.value}",
            is_active=is_active,
            must_change_password=must_change_password,
        )
        db.add(user)
        db.flush()
        return user

    return make


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role.value)}"}


def refresh_cookie(response: httpx.Response) -> str | None:
    """Значение refresh_token из Set-Cookie ответа."""
    return response.cookies.get("refresh_token")


def post_with_cookie(client: TestClient, path: str, token: str | None) -> httpx.Response:
    """Запрос с конкретной cookie — как браузер, у которого сохранилась именно она."""
    request = client.build_request("POST", path)
    request.headers.pop("Cookie", None)
    if token is not None:
        request.headers["Cookie"] = f"refresh_token={token}"
    return client.send(request)
