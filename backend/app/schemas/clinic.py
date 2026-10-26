"""Клиника для администратора (контракты, раздел 9)."""

from datetime import datetime, time
from typing import Annotated

from pydantic import BaseModel, ConfigDict, ValidationInfo, field_validator
from pydantic_core import PydanticCustomError

from app.schemas.fields import (
    ClinicAddress,
    ClinicName,
    HalfHour,
    NotNull,
    Phone,
    TimeOut,
    WorkDays,
)


class ClinicIn(BaseModel):
    """POST /admin/clinics."""

    name: ClinicName
    address: ClinicAddress
    phone: Phone
    opens_at: HalfHour
    closes_at: HalfHour
    work_days: WorkDays

    @field_validator("closes_at")
    @classmethod
    def _closes_after_opens(cls, closes_at: time, info: ValidationInfo) -> time:
        # opens_at объявлен раньше: если он прошёл проверку, он уже в info.data
        opens_at = info.data.get("opens_at")
        if opens_at is not None and closes_at <= opens_at:
            raise PydanticCustomError("closes_before_opens", "Закрытие — позже открытия")
        return closes_at


class ClinicUpdate(BaseModel):
    """PATCH /admin/clinics/{id}: только присланные поля; порядок часов проверяет сервис —
    по итоговым значениям, новое плюс сохранённое (Р-34).
    """

    name: Annotated[ClinicName | None, NotNull] = None
    address: Annotated[ClinicAddress | None, NotNull] = None
    phone: Annotated[Phone | None, NotNull] = None
    opens_at: Annotated[HalfHour | None, NotNull] = None
    closes_at: Annotated[HalfHour | None, NotNull] = None
    work_days: Annotated[WorkDays | None, NotNull] = None


class ClinicAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    is_active: bool


class AdminClinicOut(BaseModel):
    """AdminClinic из контрактов: Clinic и поля администратора."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: str
    phone: str
    opens_at: TimeOut
    closes_at: TimeOut
    work_days: list[int]
    archived_at: datetime | None
    account: ClinicAccountOut | None
    # Будущие записи появятся на этапе 7; до тех пор — 0 (поле есть в модели AdminClinic)
    future_appointments_count: int = 0


class ClinicArchivedOut(BaseModel):
    clinic: AdminClinicOut
    cancelled_appointments: int
