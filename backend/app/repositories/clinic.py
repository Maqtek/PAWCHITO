"""Запросы к таблице clinics."""

from collections.abc import Sequence

from sqlalchemy import select

from app.models.clinic import Clinic
from app.repositories.base import BaseRepository


class ClinicRepository(BaseRepository[Clinic]):
    model = Clinic

    def list_active(self) -> Sequence[Clinic]:
        """Клиники для записи: скрытые не показываются."""
        stmt = select(Clinic).where(Clinic.archived_at.is_(None)).order_by(Clinic.name, Clinic.id)
        return self.session.scalars(stmt).all()

    def list_all(self) -> Sequence[Clinic]:
        """Все клиники, включая скрытые, — для администратора."""
        stmt = select(Clinic).order_by(Clinic.name, Clinic.id)
        return self.session.scalars(stmt).all()

    def get_by_user_id(self, user_id: int) -> Clinic | None:
        """Клиника, к которой привязан аккаунт, — для кабинета клиники."""
        stmt = select(Clinic).where(Clinic.user_id == user_id)
        return self.session.scalars(stmt).one_or_none()
