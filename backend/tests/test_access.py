"""Доступ: токен, роль, блокировка, временный пароль (контракты, «Общие правила»; БП §1)."""

from collections.abc import Callable
from datetime import UTC, datetime, time, timedelta

import jwt
import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Clinic, User, UserRole
from app.routers.deps import AdminUser, ClinicUser, OwnerUser
from tests.conftest import ClientFactory, auth_headers

# Своих эндпоинтов у ролей пока нет — проверяем require_role на тестовом роутере
router = APIRouter(prefix="/api/test")


@router.get("/owner")
def owner_only(user: OwnerUser) -> dict[str, int]:
    return {"id": user.id}


@router.get("/clinic")
def clinic_only(user: ClinicUser) -> dict[str, int]:
    return {"id": user.id}


@router.get("/admin")
def admin_only(user: AdminUser) -> dict[str, int]:
    return {"id": user.id}


roles_app = FastAPI()
roles_app.include_router(router)


@pytest.fixture
def roles_client(client_factory: ClientFactory) -> TestClient:
    return client_factory(roles_app)


@pytest.mark.parametrize("role", list(UserRole))
@pytest.mark.parametrize("path_role", list(UserRole))
def test_role_matrix(
    roles_client: TestClient, make_user: Callable[..., User], role: UserRole, path_role: UserRole
) -> None:
    user = make_user(role)
    response = roles_client.get(f"/api/test/{path_role.value}", headers=auth_headers(user))
    if role == path_role:
        assert response.status_code == 200
        assert response.json() == {"id": user.id}
    else:
        assert response.status_code == 403
        assert response.json() == {"detail": "Недостаточно прав"}


@pytest.mark.parametrize("path_role", list(UserRole))
def test_without_token_401(roles_client: TestClient, path_role: UserRole) -> None:
    response = roles_client.get(f"/api/test/{path_role.value}")
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def _token(payload: dict[str, object], secret: str | None = None) -> dict[str, str]:
    key = secret or settings.jwt_secret.get_secret_value()
    return {"Authorization": f"Bearer {jwt.encode(payload, key, algorithm='HS256')}"}


@pytest.mark.parametrize(
    "headers",
    [
        {"Authorization": "Bearer garbage"},
        {"Authorization": "Basic YTpi"},
        _token({"sub": "1", "role": "owner", "exp": datetime.now(UTC) - timedelta(minutes=1)}),
        _token(
            {"sub": "1", "role": "owner", "exp": datetime.now(UTC) + timedelta(minutes=5)}, "x" * 40
        ),
    ],
    ids=["garbage", "not-bearer", "expired", "foreign-secret"],
)
def test_bad_token_401(client: TestClient, headers: dict[str, str]) -> None:
    assert client.get("/api/users/me", headers=headers).status_code == 401


def test_deleted_user_401(client: TestClient, make_user: Callable[..., User], db) -> None:
    user = make_user()
    headers = auth_headers(user)
    db.delete(user)
    db.flush()
    assert client.get("/api/users/me", headers=headers).status_code == 401


def test_blocked_user_403(client: TestClient, make_user: Callable[..., User]) -> None:
    user = make_user(is_active=False)
    response = client.get("/api/users/me", headers=auth_headers(user))
    assert response.status_code == 403
    assert response.json() == {"detail": "Аккаунт заблокирован"}


def test_role_from_db_not_from_token(
    roles_client: TestClient, make_user: Callable[..., User], db
) -> None:
    """Токен выдан владельцу, роль сменили в БД — действует новая роль (БП §1)."""
    user = make_user(UserRole.owner)
    headers = auth_headers(user)
    user.role = UserRole.admin
    db.flush()
    assert roles_client.get("/api/test/admin", headers=headers).status_code == 200
    assert roles_client.get("/api/test/owner", headers=headers).status_code == 403


class TestTemporaryPassword:
    """Временный пароль клиники: доступны только GET /users/me и смена пароля."""

    def test_users_me_allowed(self, client: TestClient, make_user: Callable[..., User]) -> None:
        user = make_user(UserRole.clinic, must_change_password=True)
        response = client.get("/api/users/me", headers=auth_headers(user))
        assert response.status_code == 200
        assert response.json()["must_change_password"] is True

    def test_other_endpoints_403(
        self, roles_client: TestClient, client: TestClient, make_user: Callable[..., User]
    ) -> None:
        user = make_user(UserRole.clinic, must_change_password=True)
        for response in (
            roles_client.get("/api/test/clinic", headers=auth_headers(user)),
            client.patch("/api/users/me", json={"full_name": "X"}, headers=auth_headers(user)),
        ):
            assert response.status_code == 403
            assert response.json() == {"detail": "password_change_required"}


class TestProfile:
    def test_get_me(self, client: TestClient, make_user: Callable[..., User]) -> None:
        user = make_user(email="anna@example.com")
        assert client.get("/api/users/me", headers=auth_headers(user)).json() == {
            "id": user.id,
            "email": "anna@example.com",
            "role": "owner",
            "full_name": user.full_name,
            "must_change_password": False,
        }

    def test_patch_name_only(self, client: TestClient, make_user: Callable[..., User]) -> None:
        user = make_user()
        response = client.patch(
            "/api/users/me",
            json={"full_name": "  Петров П.П. ", "email": "hack@example.com", "role": "admin"},
            headers=auth_headers(user),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["full_name"] == "Петров П.П."
        assert body["email"] == user.email
        assert body["role"] == "owner"

    def test_patch_empty_name_422(self, client: TestClient, make_user: Callable[..., User]) -> None:
        response = client.patch(
            "/api/users/me", json={"full_name": "   "}, headers=auth_headers(make_user())
        )
        assert response.status_code == 422
        assert response.json()["detail"][0]["msg"] == "Имя не может быть пустым"

    def test_auth_checked_before_body(self, client: TestClient) -> None:
        assert client.patch("/api/users/me", json={"full_name": ""}).status_code == 401


class TestClinicName:
    """Р-35: имя аккаунта клиники — название клиники, его меняет только администратор."""

    def _clinic(self, db: Session, account: User, name: str = "ВетДоктор") -> Clinic:
        clinic = Clinic(
            name=name,
            address="ул. Ленина, 10",
            phone="+79990000000",
            opens_at=time(9),
            closes_at=time(20),
            work_days=[1, 2, 3, 4, 5],
            user_id=account.id,
        )
        db.add(clinic)
        db.flush()
        return clinic

    def test_full_name_is_clinic_name(
        self, client: TestClient, db: Session, make_user: Callable[..., User]
    ) -> None:
        account = make_user(UserRole.clinic)
        clinic = self._clinic(db, account)
        headers = auth_headers(account)
        assert client.get("/api/users/me", headers=headers).json()["full_name"] == "ВетДоктор"

        clinic.name = "ВетДоктор на Ленина"  # переименовал администратор
        db.flush()
        db.expire_all()
        assert client.get("/api/users/me", headers=headers).json()["full_name"] == (
            "ВетДоктор на Ленина"
        )

    def test_clinic_cannot_rename_even_with_bad_body(
        self, client: TestClient, db: Session, make_user: Callable[..., User]
    ) -> None:
        account = make_user(UserRole.clinic)
        self._clinic(db, account)
        for body in ({"full_name": "Другое"}, {"full_name": 5}, {}):
            response = client.patch("/api/users/me", json=body, headers=auth_headers(account))
            assert response.status_code == 403
            assert response.json() == {"detail": "Название клиники меняет администратор"}
        assert client.get("/api/users/me", headers=auth_headers(account)).json()["full_name"] == (
            "ВетДоктор"
        )

    def test_owner_and_admin_still_rename(
        self, client: TestClient, make_user: Callable[..., User]
    ) -> None:
        for role in (UserRole.owner, UserRole.admin):
            response = client.patch(
                "/api/users/me",
                json={"full_name": "Новое имя"},
                headers=auth_headers(make_user(role)),
            )
            assert response.status_code == 200
            assert response.json()["full_name"] == "Новое имя"
