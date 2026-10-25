from typing import Literal

from pydantic import BaseModel

from app.schemas.fields import (
    CurrentPassword,
    FullName,
    LoginEmail,
    NewEmail,
    NewPassword,
    RecoveryCode,
)
from app.schemas.user import UserOut


class RegisterIn(BaseModel):
    email: NewEmail
    password: NewPassword
    full_name: FullName


class LoginIn(BaseModel):
    email: LoginEmail
    password: CurrentPassword


class TokenOut(BaseModel):
    """Token из контрактов. Refresh-токен — только в cookie."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int  # секунды


class RegisterOut(TokenOut):
    user: UserOut
    recovery_code: str  # показывается один раз


class ChangePasswordIn(BaseModel):
    current_password: CurrentPassword
    new_password: NewPassword


class RecoverIn(BaseModel):
    email: LoginEmail
    recovery_code: RecoveryCode
    new_password: NewPassword


class RecoveryCodeIn(BaseModel):
    """POST /users/me/recovery-code: новый код только с текущим паролем."""

    current_password: CurrentPassword


class RecoveryCodeOut(BaseModel):
    recovery_code: str  # показывается один раз
