from pydantic import BaseModel, ConfigDict

from app.models import UserRole
from app.schemas.fields import FullName


class UserOut(BaseModel):
    """User из контрактов."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: UserRole
    full_name: str | None  # у аккаунта клиники имени нет
    must_change_password: bool


class UserUpdate(BaseModel):
    """PATCH /users/me: меняется только имя."""

    full_name: FullName
