"""Клиники для администратора (контракты, раздел 9; Р-33, Р-34, Р-36)."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Clinic, User, UserRole
from tests.conftest import ClientFactory, auth_headers

URL = "/api/admin/clinics"
CLINIC: dict[str, Any] = {
    "name": "ВетДоктор",
    "address": "ул. Ленина, 10",
    "phone": "+79990000000",
    "opens_at": "09:00",
    "closes_at": "20:00",
    "work_days": [6, 1, 2, 3, 4, 5],
}


@pytest.fixture
def admin(make_user: Callable[..., User]) -> dict[str, str]:
    return auth_headers(make_user(UserRole.admin))


def _create(client: TestClient, admin: dict[str, str], **changes: Any) -> dict[str, Any]:
    response = client.post(URL, json={**CLINIC, **changes}, headers=admin)
    assert response.status_code == 201, response.text
    return response.json()


def _errors(response: Any) -> dict[str, str]:
    assert response.status_code == 422, response.text
    return {str(e["loc"][-1]): e["msg"] for e in response.json()["detail"]}


class TestAccess:
    @pytest.mark.parametrize("role", [UserRole.owner, UserRole.clinic])
    def test_other_roles_403(
        self, client: TestClient, make_user: Callable[..., User], role: UserRole
    ) -> None:
        headers = auth_headers(make_user(role))
        assert client.get(URL, headers=headers).status_code == 403
        assert client.post(URL, json=CLINIC, headers=headers).status_code == 403

    def test_without_token_401(self, client: TestClient) -> None:
        assert client.get(URL).status_code == 401

    def test_access_before_body(self, client: TestClient, make_user: Callable[..., User]) -> None:
        headers = auth_headers(make_user(UserRole.owner))
        assert client.post(URL, json={}, headers=headers).status_code == 403


class TestCreate:
    def test_created_normalized(self, client: TestClient, admin: dict[str, str]) -> None:
        body = _create(client, admin, name="  ВетДоктор ", address=" ул. Ленина, 10 ")
        assert body["name"] == "ВетДоктор"
        assert body["address"] == "ул. Ленина, 10"
        assert body["opens_at"] == "09:00" and body["closes_at"] == "20:00"
        assert body["work_days"] == [1, 2, 3, 4, 5, 6]  # отсортированы
        assert body["archived_at"] is None
        assert body["account"] is None
        assert body["future_appointments_count"] == 0

    def test_latest_slot_and_midnight_start(
        self, client: TestClient, admin: dict[str, str]
    ) -> None:
        body = _create(client, admin, opens_at="00:00", closes_at="23:30")
        assert (body["opens_at"], body["closes_at"]) == ("00:00", "23:30")

    @pytest.mark.parametrize("value", ["9:00", "09:00:00", "24:00", "09:15", "09:00+03:00", 900])
    def test_bad_time(self, client: TestClient, admin: dict[str, str], value: object) -> None:
        errors = _errors(client.post(URL, json={**CLINIC, "opens_at": value}, headers=admin))
        assert "opens_at" in errors

    def test_closes_not_after_opens(self, client: TestClient, admin: dict[str, str]) -> None:
        for closes in ("09:00", "08:30"):
            errors = _errors(client.post(URL, json={**CLINIC, "closes_at": closes}, headers=admin))
            assert errors == {"closes_at": "Закрытие — позже открытия"}

    @pytest.mark.parametrize(
        ("value", "message"),
        [
            ([], "Нужен хотя бы один рабочий день"),
            ([1, 1], "Рабочие дни не должны повторяться"),
            ([0], "Рабочие дни — числа от 1 до 7"),
            ([8], "Рабочие дни — числа от 1 до 7"),
            (["1"], "Рабочие дни — числа от 1 до 7"),
            ([1.0], "Рабочие дни — числа от 1 до 7"),
            ([True], "Рабочие дни — числа от 1 до 7"),
            ("1,2", "Нужен хотя бы один рабочий день"),
        ],
    )
    def test_bad_work_days(
        self, client: TestClient, admin: dict[str, str], value: object, message: str
    ) -> None:
        errors = _errors(client.post(URL, json={**CLINIC, "work_days": value}, headers=admin))
        assert errors == {"work_days": message}

    @pytest.mark.parametrize(
        "phone", ["89990000000", "+7 999 000-00-00", "+7999000000", "+799900000001"]
    )
    def test_bad_phone(self, client: TestClient, admin: dict[str, str], phone: str) -> None:
        errors = _errors(client.post(URL, json={**CLINIC, "phone": phone}, headers=admin))
        assert errors == {"phone": "Телефон: +7 и 10 цифр"}

    def test_text_fields(self, client: TestClient, admin: dict[str, str]) -> None:
        body = {**CLINIC, "name": "   ", "address": "a" * 201}
        errors = _errors(client.post(URL, json=body, headers=admin))
        assert errors["name"] == "Название не может быть пустым"
        assert errors["address"] == "Адрес — не длиннее 200 символов"
        body = {**CLINIC, "name": "Вет\x07Доктор"}
        assert _errors(client.post(URL, json=body, headers=admin)) == {
            "name": "Текст содержит недопустимые символы"
        }

    def test_name_not_unique(self, client: TestClient, admin: dict[str, str]) -> None:
        _create(client, admin)
        _create(client, admin)  # сети клиник и филиалы (Р-34)


class TestReadAndUpdate:
    def test_list_includes_archived(self, client: TestClient, admin: dict[str, str]) -> None:
        active, hidden = _create(client, admin, name="А"), _create(client, admin, name="Б")
        client.post(f"{URL}/{hidden['id']}/archive", headers=admin)
        ids = {c["id"]: c["archived_at"] for c in client.get(URL, headers=admin).json()}
        assert ids[active["id"]] is None and ids[hidden["id"]] is not None

    def test_get_and_404(self, client: TestClient, admin: dict[str, str]) -> None:
        clinic = _create(client, admin)
        assert client.get(f"{URL}/{clinic['id']}", headers=admin).json() == clinic
        response = client.get(f"{URL}/999999", headers=admin)
        assert response.status_code == 404
        assert response.json() == {"detail": "Клиника не найдена"}

    def test_patch_only_sent_fields(self, client: TestClient, admin: dict[str, str]) -> None:
        clinic = _create(client, admin)
        body = client.patch(
            f"{URL}/{clinic['id']}",
            json={"phone": "+79991112233", "closes_at": "21:00"},
            headers=admin,
        ).json()
        assert body == {**clinic, "phone": "+79991112233", "closes_at": "21:00"}

    def test_patch_empty_body_no_changes(self, client: TestClient, admin: dict[str, str]) -> None:
        clinic = _create(client, admin)
        response = client.patch(f"{URL}/{clinic['id']}", json={}, headers=admin)
        assert response.status_code == 200
        assert response.json() == clinic

    def test_patch_null_422(self, client: TestClient, admin: dict[str, str]) -> None:
        clinic = _create(client, admin)
        errors = _errors(
            client.patch(
                f"{URL}/{clinic['id']}", json={"name": None, "work_days": None}, headers=admin
            )
        )
        assert set(errors) == {"name", "work_days"}

    def test_patch_hours_checked_with_stored(
        self, client: TestClient, admin: dict[str, str]
    ) -> None:
        clinic = _create(client, admin)  # 09:00–20:00
        url = f"{URL}/{clinic['id']}"
        assert _errors(client.patch(url, json={"closes_at": "08:00"}, headers=admin)) == {
            "closes_at": "Закрытие — позже открытия"
        }
        assert _errors(client.patch(url, json={"opens_at": "20:00"}, headers=admin)) == {
            "closes_at": "Закрытие — позже открытия"
        }
        # Оба сразу — проверяются новые значения
        ok = client.patch(url, json={"opens_at": "21:00", "closes_at": "23:30"}, headers=admin)
        assert ok.status_code == 200

    def test_patch_order_body_then_404(self, client: TestClient, admin: dict[str, str]) -> None:
        assert client.patch(f"{URL}/999999", json={"phone": "x"}, headers=admin).status_code == 422
        assert client.patch(f"{URL}/999999", json={}, headers=admin).status_code == 404


class TestArchive:
    def _with_account(
        self, client: TestClient, admin: dict[str, str], db: Session, make_user: Callable[..., User]
    ) -> tuple[dict[str, Any], User]:
        clinic = _create(client, admin)
        account = make_user(UserRole.clinic)
        db.get(Clinic, clinic["id"]).user_id = account.id  # аккаунт — #52, пока вручную
        db.flush()
        return clinic, account

    def test_archive_blocks_account_and_ends_sessions(
        self,
        client_factory: ClientFactory,
        admin: dict[str, str],
        db: Session,
        make_user: Callable[..., User],
    ) -> None:
        client, clinic_device = client_factory(), client_factory()
        clinic, account = self._with_account(client, admin, db, make_user)
        login = clinic_device.post(
            "/api/auth/login", json={"email": account.email, "password": "secret123"}
        )
        assert login.status_code == 200

        response = client.post(f"{URL}/{clinic['id']}/archive", headers=admin)
        assert response.status_code == 200
        body = response.json()
        assert body["cancelled_appointments"] == 0
        assert body["clinic"]["archived_at"] is not None
        assert body["clinic"]["account"] == {
            "id": account.id,
            "email": account.email,
            "is_active": False,
        }
        assert clinic_device.post("/api/auth/refresh").status_code == 401
        assert client.get("/api/users/me", headers=auth_headers(account)).status_code == 403

    def test_archived_at_in_moscow_time(
        self, client: TestClient, admin: dict[str, str], db: Session
    ) -> None:
        """Время из базы — со смещением Europe/Moscow, как в контрактах, а не в UTC."""
        clinic = _create(client, admin)
        client.post(f"{URL}/{clinic['id']}/archive", headers=admin)
        db.expire_all()  # следующий ответ — из базы, а не из объекта в памяти
        archived_at = client.get(f"{URL}/{clinic['id']}", headers=admin).json()["archived_at"]
        assert archived_at.endswith("+03:00"), archived_at

    def test_archive_again_no_changes(self, client: TestClient, admin: dict[str, str]) -> None:
        clinic = _create(client, admin)
        first = client.post(f"{URL}/{clinic['id']}/archive", headers=admin).json()
        second = client.post(f"{URL}/{clinic['id']}/archive", headers=admin).json()
        assert second == {**first, "cancelled_appointments": 0}

    def test_restore_unblocks_account(
        self, client: TestClient, admin: dict[str, str], db: Session, make_user: Callable[..., User]
    ) -> None:
        clinic, account = self._with_account(client, admin, db, make_user)
        client.post(f"{URL}/{clinic['id']}/archive", headers=admin)
        body = client.post(f"{URL}/{clinic['id']}/restore", headers=admin).json()
        assert body["archived_at"] is None
        assert body["account"]["is_active"] is True
        assert client.get("/api/users/me", headers=auth_headers(account)).status_code == 200

    def test_restore_not_archived_no_changes(
        self, client: TestClient, admin: dict[str, str]
    ) -> None:
        clinic = _create(client, admin)
        assert client.post(f"{URL}/{clinic['id']}/restore", headers=admin).json() == clinic

    def test_404(self, client: TestClient, admin: dict[str, str]) -> None:
        for action in ("archive", "restore"):
            assert client.post(f"{URL}/999999/{action}", headers=admin).status_code == 404
