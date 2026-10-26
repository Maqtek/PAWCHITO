"""Запросы к таблице pets."""

from collections.abc import Sequence

from sqlalchemy import select

from app.models.pet import Pet
from app.repositories.base import BaseRepository


class PetRepository(BaseRepository[Pet]):
    model = Pet

    def list_for_owner(self, owner_id: int) -> Sequence[Pet]:
        """Активные питомцы владельца в порядке добавления; первый выбран по умолчанию (Р-42)."""
        stmt = (
            select(Pet).where(Pet.owner_id == owner_id, Pet.archived_at.is_(None)).order_by(Pet.id)
        )
        return self.session.scalars(stmt).all()

    def list_archived_for_owner(self, owner_id: int) -> Sequence[Pet]:
        """Архивные питомцы владельца — для расширенной версии (Р-40)."""
        stmt = (
            select(Pet)
            .where(Pet.owner_id == owner_id, Pet.archived_at.is_not(None))
            .order_by(Pet.id)
        )
        return self.session.scalars(stmt).all()

    def get_owned(self, pet_id: int, owner_id: int) -> Pet | None:
        """Питомец, только если он этого владельца (иначе API отдаёт 404, Р-42).

        Архивного тоже возвращает: GET и PATCH работают с ним как обычно.
        """
        stmt = select(Pet).where(Pet.id == pet_id, Pet.owner_id == owner_id)
        return self.session.scalars(stmt).one_or_none()
