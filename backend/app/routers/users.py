"""Эндпоинты /api/users/me: текущий пользователь и профиль."""

from fastapi import APIRouter, HTTPException, status

from app.routers.deps import (
    AuthServiceDep,
    CurrentUser,
    OwnerUser,
    UserAllowPasswordChange,
    UserServiceDep,
)
from app.schemas.auth import RecoveryCodeIn, RecoveryCodeOut
from app.schemas.user import UserOut, UserUpdate
from app.services.auth import InvalidCurrentPasswordError

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
def read_me(user: UserAllowPasswordChange) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/me")
def update_me(data: UserUpdate, user: CurrentUser, service: UserServiceDep) -> UserOut:
    return UserOut.model_validate(service.update_profile(user, data.full_name))


@router.post("/me/recovery-code")
def regenerate_recovery_code(
    data: RecoveryCodeIn, user: OwnerUser, service: AuthServiceDep
) -> RecoveryCodeOut:
    try:
        recovery_code = service.regenerate_recovery_code(user, data.current_password)
    except InvalidCurrentPasswordError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Неверный текущий пароль") from None
    return RecoveryCodeOut(recovery_code=recovery_code)
