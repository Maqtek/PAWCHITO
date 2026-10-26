"""Клиника: часы работы, рабочие дни, аккаунт, скрытие (этап 3)."""

from datetime import time
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import ArchivedMixin, Base, CreatedAtMixin, IdMixin

if TYPE_CHECKING:
    from app.models.user import User


class Clinic(IdMixin, ArchivedMixin, CreatedAtMixin, Base):
    """Клинику не удаляют, а скрывают (archived_at). Правила полей — Р-33, Р-34."""

    __tablename__ = "clinics"
    __table_args__ = (
        CheckConstraint("char_length(name) BETWEEN 1 AND 100", name="name_length"),
        CheckConstraint("char_length(address) BETWEEN 1 AND 200", name="address_length"),
        CheckConstraint("phone ~ '^\\+7[0-9]{10}$'", name="phone_format"),
        # часы в пределах одних суток, слоты по 30 минут: время только ЧЧ:00 или ЧЧ:30
        CheckConstraint("opens_at < closes_at", name="hours"),
        CheckConstraint(
            "date_part('minute', opens_at) IN (0, 30) AND date_part('second', opens_at) = 0 "
            "AND date_part('minute', closes_at) IN (0, 30) AND date_part('second', closes_at) = 0",
            name="half_hours",
        ),
        # 1 — понедельник … 7 — воскресенье, хотя бы один день
        CheckConstraint(
            "cardinality(work_days) BETWEEN 1 AND 7 AND work_days <@ '{1,2,3,4,5,6,7}'",
            name="work_days",
        ),
    )

    name: Mapped[str]
    address: Mapped[str]
    phone: Mapped[str]  # +7XXXXXXXXXX, нормализует фронт
    opens_at: Mapped[time]
    closes_at: Mapped[time]
    work_days: Mapped[list[int]] = mapped_column(ARRAY(SmallInteger))
    # аккаунт клиники; NULL — администратор ещё не создал. Один аккаунт на клинику
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), unique=True
    )

    account: Mapped["User | None"] = relationship()

    def works_on(self, iso_weekday: int) -> bool:
        """Работает ли клиника в этот день недели (date.isoweekday())."""
        return iso_weekday in self.work_days
