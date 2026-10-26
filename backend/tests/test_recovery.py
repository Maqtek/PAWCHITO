"""Смена пароля, восстановление по коду и новый код (контракты, раздел 1; БП §1)."""

from collections.abc import Callable

from fastapi.testclient import TestClient

from app.models import User, UserRole
from tests.conftest import PASSWORD, ClientFactory, auth_headers

NEW_PASSWORD = "brandnew12"


def _register(client: TestClient, email: str = "owner@example.com") -> dict[str, object]:
    response = client.post(
        "/api/auth/register", json={"email": email, "password": PASSWORD, "full_name": "Анна"}
    )
    assert response.status_code == 201
    return response.json()


def _login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _recover(client: TestClient, code: str, email: str = "owner@example.com"):
    return client.post(
        "/api/auth/recover",
        json={"email": email, "recovery_code": code, "new_password": NEW_PASSWORD},
    )


class TestChangePassword:
    def _change(self, client: TestClient, headers: dict[str, str], current: str = PASSWORD):
        return client.post(
            "/api/auth/change-password",
            json={"current_password": current, "new_password": NEW_PASSWORD},
            headers=headers,
        )

    def test_other_sessions_end_current_continues(self, client_factory: ClientFactory) -> None:
        laptop, phone = client_factory(), client_factory()
        headers = {"Authorization": f"Bearer {_register(laptop)['access_token']}"}
        _login(phone, "owner@example.com")

        response = self._change(laptop, headers)
        assert response.status_code == 200
        assert response.json()["access_token"]
        # Сначала старое устройство с законно отозванным токеном — это не кража
        assert phone.post("/api/auth/refresh").status_code == 401
        assert laptop.post("/api/auth/refresh").status_code == 200
        assert _login(phone, "owner@example.com", NEW_PASSWORD).status_code == 200
        assert _login(phone, "owner@example.com").status_code == 401

    def test_wrong_current_400(self, client: TestClient, make_user: Callable[..., User]) -> None:
        response = self._change(client, auth_headers(make_user()), current="wrong-pass")
        assert response.status_code == 400
        assert response.json() == {"detail": "Неверный текущий пароль"}

    def test_temporary_password_reset(
        self, client: TestClient, make_user: Callable[..., User]
    ) -> None:
        clinic = make_user(UserRole.clinic, must_change_password=True)
        response = self._change(client, auth_headers(clinic))
        assert response.status_code == 200
        me = client.get(
            "/api/users/me", headers={"Authorization": f"Bearer {response.json()['access_token']}"}
        )
        assert me.json()["must_change_password"] is False

    def test_without_token_401(self, client: TestClient) -> None:
        assert self._change(client, {}).status_code == 401


class TestRecover:
    def test_code_normalized_sessions_ended(self, client_factory: ClientFactory) -> None:
        owner, other_device = client_factory(), client_factory()
        code = str(_register(owner)["recovery_code"])
        _login(other_device, "owner@example.com")

        messy = " " + code.replace("-", "").lower() + " "
        response = _recover(owner, messy, email=" OWNER@example.com ")
        assert response.status_code == 200
        new_code = response.json()["recovery_code"]
        assert new_code != code
        assert 'refresh_token=""' in response.headers["set-cookie"]
        assert other_device.post("/api/auth/refresh").status_code == 401
        assert _login(owner, "owner@example.com", NEW_PASSWORD).status_code == 200

    def test_code_is_one_time(self, client: TestClient) -> None:
        code = str(_register(client)["recovery_code"])
        assert _recover(client, code).status_code == 200
        assert _recover(client, code).status_code == 400

    def test_wrong_code_unknown_email_and_clinic_400(
        self, client: TestClient, make_user: Callable[..., User]
    ) -> None:
        _register(client)
        make_user(UserRole.clinic, email="clinic@example.com")
        for email in ("owner@example.com", "nobody@example.com", "clinic@example.com"):
            response = _recover(client, "AAAA-BBBB-CCCC-DDDD", email=email)
            assert response.status_code == 400
            assert response.json() == {"detail": "Неверный email или код"}

    def test_bad_code_format_422(self, client: TestClient) -> None:
        # Кириллическая «К» вместо латинской и слишком короткий код
        for code in ("К7QM-2XPA-9RTD-4WNB", "ABC"):
            response = _recover(client, code)
            assert response.status_code == 422
            assert response.json()["detail"][0]["msg"] == "Код в формате XXXX-XXXX-XXXX-XXXX"


class TestNewRecoveryCode:
    def test_old_code_stops_working(self, client: TestClient) -> None:
        registered = _register(client)
        headers = {"Authorization": f"Bearer {registered['access_token']}"}
        response = client.post(
            "/api/users/me/recovery-code", json={"current_password": PASSWORD}, headers=headers
        )
        assert response.status_code == 200
        assert _recover(client, str(registered["recovery_code"])).status_code == 400
        assert _recover(client, response.json()["recovery_code"]).status_code == 200

    def test_session_kept(self, client: TestClient) -> None:
        headers = {"Authorization": f"Bearer {_register(client)['access_token']}"}
        client.post(
            "/api/users/me/recovery-code", json={"current_password": PASSWORD}, headers=headers
        )
        assert client.post("/api/auth/refresh").status_code == 200

    def test_wrong_password_400_and_clinic_403(
        self, client: TestClient, make_user: Callable[..., User]
    ) -> None:
        owner, clinic = make_user(), make_user(UserRole.clinic)
        wrong = client.post(
            "/api/users/me/recovery-code",
            json={"current_password": "wrong-pass"},
            headers=auth_headers(owner),
        )
        assert wrong.status_code == 400
        forbidden = client.post(
            "/api/users/me/recovery-code",
            json={"current_password": PASSWORD},
            headers=auth_headers(clinic),
        )
        assert forbidden.status_code == 403
