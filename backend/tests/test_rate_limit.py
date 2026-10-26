"""Лимит неудачных попыток: 5 неудач — пауза 15 минут (БП §1, Р-31)."""

from collections.abc import Callable

from fastapi.testclient import TestClient

from app.models import User
from app.services.rate_limit import AttemptLimiter
from tests.conftest import PASSWORD, auth_headers


def _login(client: TestClient, email: str, password: str = PASSWORD) -> int:
    return client.post("/api/auth/login", json={"email": email, "password": password}).status_code


def test_pause_after_five_failures_even_with_right_password(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user(email="anna@example.com")
    assert [_login(client, "anna@example.com", "wrong-pass") for _ in range(5)] == [401] * 5
    response = client.post(
        "/api/auth/login", json={"email": "anna@example.com", "password": PASSWORD}
    )
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "900"
    # Регистр и пробелы паузу не обходят, другие аккаунты не задеты
    assert _login(client, " ANNA@example.com ") == 429
    make_user(email="boris@example.com")
    assert _login(client, "boris@example.com") == 200


def test_unknown_email_also_paused(client: TestClient) -> None:
    codes = [_login(client, "nobody@example.com", "wrong-pass") for _ in range(6)]
    assert codes == [401] * 5 + [429]


def test_success_resets_counter(client: TestClient, make_user: Callable[..., User]) -> None:
    make_user(email="anna@example.com")
    for _ in range(4):
        _login(client, "anna@example.com", "wrong-pass")
    assert _login(client, "anna@example.com") == 200
    assert [_login(client, "anna@example.com", "wrong-pass") for _ in range(4)] == [401] * 4
    assert _login(client, "anna@example.com") == 200


def test_422_is_not_an_attempt(client: TestClient, make_user: Callable[..., User]) -> None:
    make_user(email="anna@example.com")
    for _ in range(6):
        assert client.post("/api/auth/login", json={"email": "anna@example.com"}).status_code == 422
    assert _login(client, "anna@example.com") == 200


def test_one_counter_for_all_password_checks(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    """Вход, восстановление, смена пароля и новый код считаются вместе (Р-31)."""
    user = make_user(email="anna@example.com")
    headers = auth_headers(user)
    wrong = {"current_password": "wrong-pass", "new_password": "brandnew12"}
    statuses = [
        _login(client, "anna@example.com", "wrong-pass"),
        client.post(
            "/api/auth/recover",
            json={
                "email": "anna@example.com",
                "recovery_code": "AAAA-BBBB-CCCC-DDDD",
                "new_password": "brandnew12",
            },
        ).status_code,
        client.post("/api/auth/change-password", json=wrong, headers=headers).status_code,
        client.post("/api/auth/change-password", json=wrong, headers=headers).status_code,
        client.post(
            "/api/users/me/recovery-code", json={"current_password": "wrong-pass"}, headers=headers
        ).status_code,
    ]
    assert statuses == [401, 400, 400, 400, 400]
    right = {"current_password": PASSWORD, "new_password": "brandnew12"}
    assert client.post("/api/auth/change-password", json=right, headers=headers).status_code == 429
    assert _login(client, "anna@example.com") == 429


def test_pause_ends(
    client: TestClient, make_user: Callable[..., User], limiter: AttemptLimiter
) -> None:
    make_user(email="anna@example.com")
    for _ in range(5):
        _login(client, "anna@example.com", "wrong-pass")
    limiter.client.delete("auth:lock:anna@example.com")  # как будто прошло 15 минут
    assert _login(client, "anna@example.com") == 200
