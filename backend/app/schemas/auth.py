from typing import Literal

from pydantic import BaseModel

from app.schemas.fields import CurrentPassword, FullName, LoginEmail, NewEmail, NewPassword
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
