"""Врач клиники: отпуск, архив (этап 4). Своего входа у врача нет."""

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import ArchivedMixin, Base, CreatedAtMixin, IdMixin

if TYPE_CHECKING:
    from app.models.clinic import Clinic


class Vet(IdMixin, ArchivedMixin, CreatedAtMixin, Base):
    """Врача не удаляют, а архивируют (BR-05.5). Правила полей — Р-38."""

    __tablename__ = "vets"
    __table_args__ = (
        CheckConstraint("char_length(full_name) BETWEEN 1 AND 100", name="full_name_length"),
        # пустую специализацию API сохраняет как NULL
        CheckConstraint(
            "specialization IS NULL OR char_length(specialization) BETWEEN 1 AND 100",
            name="specialization_length",
        ),
        # пара (врач, клиника) — на неё сошлётся запись к врачу (этап 7),
        # чтобы база не дала записать к врачу «не той» клиники
        UniqueConstraint("id", "clinic_id"),
    )

    clinic_id: Mapped[int] = mapped_column(
        ForeignKey("clinics.id", ondelete="RESTRICT"), index=True
    )
    full_name: Mapped[str]
    specialization: Mapped[str | None]
    # флаг без дат (Р-37): пока стоит, к врачу нельзя записаться
    on_vacation: Mapped[bool] = mapped_column(server_default=false())

    clinic: Mapped["Clinic"] = relationship()

    @property
    def is_bookable(self) -> bool:
        """Можно ли предложить врача в новой записи: не в отпуске и не в архиве."""
        return not self.on_vacation and not self.is_archived
