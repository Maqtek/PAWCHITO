from pydantic import BaseModel, ConfigDict, Field

from app.models import UserRole
from app.schemas.fields import FullName


class UserOut(BaseModel):
    """User из контрактов."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: UserRole
    # Читается из User.display_name: у клиники — её название (Р-35); в JSON поле — full_name
    full_name: str | None = Field(validation_alias="display_name")
    must_change_password: bool


class UserUpdate(BaseModel):
    """PATCH /users/me: меняется только имя."""

    full_name: FullName
