"""Регистрация, вход, обмен refresh-токена и выход (контракты, раздел 1; БП §1)."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import RefreshToken, User, UserRole
from tests.conftest import PASSWORD, ClientFactory, post_with_cookie, refresh_cookie


def _register(client: TestClient, email: str = "owner@example.com") -> dict[str, object]:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": PASSWORD, "full_name": "Иванов И.И."},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _active_tokens(db: Session, user_id: int) -> int:
    stmt = select(func.count()).where(
        RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
    )
    return db.scalar(stmt) or 0


class TestRegister:
    def test_creates_owner_with_code_and_cookie(self, client: TestClient) -> None:
        response = client.post(
            "/api/auth/register",
            json={"email": " Owner@Example.com ", "password": PASSWORD, "full_name": " Анна "},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["user"]["email"] == "owner@example.com"
        assert body["user"]["role"] == "owner"
        assert body["user"]["full_name"] == "Анна"
        assert len(body["recovery_code"]) == 19
        assert body["token_type"] == "bearer" and body["expires_in"] == 900
        cookie = response.headers["set-cookie"]
        for part in ("HttpOnly", "Secure", "Path=/api/auth", "SameSite=strict"):
            assert part in cookie

    def test_email_taken_case_insensitive_409(self, client: TestClient) -> None:
        _register(client, "owner@example.com")
        response = client.post(
            "/api/auth/register",
            json={"email": "OWNER@example.com", "password": PASSWORD, "full_name": "Б"},
        )
        assert response.status_code == 409

    def test_validation_422_russian_without_input(self, client: TestClient) -> None:
        response = client.post(
            "/api/auth/register", json={"email": "bad", "password": "123", "full_name": "  "}
        )
        assert response.status_code == 422
        errors = {e["loc"][-1]: e for e in response.json()["detail"]}
        assert errors["email"]["msg"] == "Неверный формат email"
        assert errors["password"]["msg"] == "Пароль — не короче 8 символов"
        assert errors["full_name"]["msg"] == "Имя не может быть пустым"
        assert all("input" not in e for e in errors.values())


class TestLogin:
    def test_ok(self, client: TestClient, make_user: Callable[..., User]) -> None:
        user = make_user(email="anna@example.com")
        response = _login(client, "ANNA@example.com")
        assert response.status_code == 200
        assert refresh_cookie(response)
        me = client.get(
            "/api/users/me", headers={"Authorization": f"Bearer {response.json()['access_token']}"}
        )
        assert me.json()["id"] == user.id

    def test_wrong_password_and_unknown_email_401(
        self, client: TestClient, make_user: Callable[..., User]
    ) -> None:
        make_user(email="anna@example.com")
        for email, password in (
            ("anna@example.com", "wrong-pass"),
            ("nobody@example.com", PASSWORD),
        ):
            response = _login(client, email, password)
            assert response.status_code == 401
            assert response.json() == {"detail": "Неверный email или пароль"}

    def test_blocked_403_only_with_right_password(
        self, client: TestClient, make_user: Callable[..., User]
    ) -> None:
        make_user(email="anna@example.com", is_active=False)
        assert _login(client, "anna@example.com", "wrong-pass").status_code == 401
        assert _login(client, "anna@example.com").status_code == 403


class TestRefresh:
    def test_rotation(self, client: TestClient, db: Session) -> None:
        user_id = _register(client)["user"]["id"]
        first = refresh_cookie(client.post("/api/auth/refresh"))  # cookie из регистрации
        assert first
        second = refresh_cookie(client.post("/api/auth/refresh"))
        assert second and second != first
        assert _active_tokens(db, user_id) == 1

    def test_without_cookie_401(self, client: TestClient) -> None:
        response = client.post("/api/auth/refresh")
        assert response.status_code == 401
        assert 'refresh_token=""' in response.headers["set-cookie"]  # cookie очищена

    def test_reuse_ends_all_sessions(self, client_factory: ClientFactory, db: Session) -> None:
        """Старый токен пришёл после обмена — кража: завершаются все сессии (БП §1)."""
        laptop, phone = client_factory(), client_factory()
        user_id = _register(laptop)["user"]["id"]
        stolen = laptop.cookies["refresh_token"]
        assert laptop.post("/api/auth/refresh").status_code == 200
        assert _login(phone, "owner@example.com").status_code == 200

        assert post_with_cookie(laptop, "/api/auth/refresh", stolen).status_code == 401
        assert _active_tokens(db, user_id) == 0
        assert phone.post("/api/auth/refresh").status_code == 401

    def test_relogin_after_theft_not_killed_by_old_token(
        self, client_factory: ClientFactory
    ) -> None:
        owner, thief = client_factory(), client_factory()
        _register(owner)
        stolen = owner.cookies["refresh_token"]
        owner.post("/api/auth/refresh")
        post_with_cookie(thief, "/api/auth/refresh", stolen)  # кража обнаружена
        assert _login(owner, "owner@example.com").status_code == 200
        post_with_cookie(thief, "/api/auth/refresh", stolen)  # вор пробует ещё раз
        assert owner.post("/api/auth/refresh").status_code == 200

    def test_expired_401(self, client: TestClient, db: Session) -> None:
        user_id = _register(client)["user"]["id"]
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id)
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        assert client.post("/api/auth/refresh").status_code == 401

    def test_blocked_user_401(self, client: TestClient, db: Session) -> None:
        user_id = _register(client)["user"]["id"]
        db.execute(update(User).where(User.id == user_id).values(is_active=False))
        assert client.post("/api/auth/refresh").status_code == 401


class TestLogout:
    def test_logout(self, client: TestClient) -> None:
        _register(client)
        token = client.cookies["refresh_token"]
        response = client.post("/api/auth/logout")
        assert response.status_code == 204
        assert 'refresh_token=""' in response.headers["set-cookie"]
        assert post_with_cookie(client, "/api/auth/refresh", token).status_code == 401

    def test_lost_logout_response_is_not_theft(self, client_factory: ClientFactory) -> None:
        """Ответ на выход потерялся, браузер обменял ту же cookie — другие сессии живы."""
        laptop, phone = client_factory(), client_factory()
        _register(laptop)
        token = laptop.cookies["refresh_token"]
        _login(phone, "owner@example.com")
        post_with_cookie(laptop, "/api/auth/logout", token)
        assert post_with_cookie(laptop, "/api/auth/refresh", token).status_code == 401
        assert phone.post("/api/auth/refresh").status_code == 200

    def test_without_cookie_204(self, client: TestClient) -> None:
        assert client.post("/api/auth/logout").status_code == 204


def test_clinic_role_cannot_register(client: TestClient) -> None:
    """Регистрация создаёт только владельца — роль из тела не берётся."""
    body = client.post(
        "/api/auth/register",
        json={"email": "c@example.com", "password": PASSWORD, "full_name": "К", "role": "admin"},
    ).json()
    assert body["user"]["role"] == UserRole.owner.value
