"""Питомец (этап 5). Фото и статус ухода добавятся на этапе 9."""

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import ArchivedMixin, Base, CreatedAtMixin, IdMixin
from app.models.enums import PetSex, PetSpecies, pet_sex, pet_species

if TYPE_CHECKING:
    from app.models.user import User


class Pet(IdMixin, ArchivedMixin, CreatedAtMixin, Base):
    """Питомца не удаляют, а архивируют: история здоровья и приёмов сохраняется. Поля — Р-41."""

    __tablename__ = "pets"
    __table_args__ = (
        CheckConstraint("char_length(name) BETWEEN 1 AND 50", name="name_length"),
        # пустую породу API сохраняет как NULL
        CheckConstraint(
            "breed IS NULL OR char_length(breed) BETWEEN 1 AND 100", name="breed_length"
        ),
        # «не позже сегодня» проверяет API: в CHECK нельзя использовать текущую дату
        CheckConstraint("birth_date IS NULL OR birth_date >= '1900-01-01'", name="birth_date"),
    )

    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str]
    species: Mapped[PetSpecies] = mapped_column(pet_species)
    breed: Mapped[str | None]
    birth_date: Mapped[date | None]
    sex: Mapped[PetSex] = mapped_column(pet_sex, server_default=PetSex.unknown.value)

    owner: Mapped["User"] = relationship()
