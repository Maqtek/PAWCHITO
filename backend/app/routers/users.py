"""Эндпоинты /api/users/me: текущий пользователь и профиль."""

from fastapi import APIRouter

from app.routers.deps import CurrentUser, UserAllowPasswordChange, UserServiceDep
from app.schemas.user import UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
def read_me(user: UserAllowPasswordChange) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/me")
def update_me(data: UserUpdate, user: CurrentUser, service: UserServiceDep) -> UserOut:
    return UserOut.model_validate(service.update_profile(user, data.full_name))
