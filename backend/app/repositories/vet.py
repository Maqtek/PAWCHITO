"""Запросы к таблице vets."""

from collections.abc import Sequence

from sqlalchemy import select

from app.models.vet import Vet
from app.repositories.base import BaseRepository


class VetRepository(BaseRepository[Vet]):
    model = Vet

    def list_for_clinic(self, clinic_id: int, include_archived: bool = False) -> Sequence[Vet]:
        """Врачи клиники в порядке добавления; архивные — только по запросу."""
        stmt = select(Vet).where(Vet.clinic_id == clinic_id)
        if not include_archived:
            stmt = stmt.where(Vet.archived_at.is_(None))
        return self.session.scalars(stmt.order_by(Vet.id)).all()

    def list_bookable(self, clinic_id: int) -> Sequence[Vet]:
        """Врачи, к которым можно записаться: не в архиве и не в отпуске."""
        stmt = (
            select(Vet)
            .where(
                Vet.clinic_id == clinic_id,
                Vet.archived_at.is_(None),
                Vet.on_vacation.is_(False),
            )
            .order_by(Vet.id)
        )
        return self.session.scalars(stmt).all()

    def get_for_clinic(self, vet_id: int, clinic_id: int) -> Vet | None:
        """Врач, только если он из этой клиники (иначе API отдаёт 404, Р-39)."""
        stmt = select(Vet).where(Vet.id == vet_id, Vet.clinic_id == clinic_id)
        return self.session.scalars(stmt).one_or_none()
