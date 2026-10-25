"""Refresh-токен на 30 дней. В базе только хеш, сам токен — в cookie (этап 2)."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, IdMixin

if TYPE_CHECKING:
    from app.models.user import User


class RefreshToken(IdMixin, CreatedAtMixin, Base):
    __tablename__ = "refresh_tokens"

    # удалили пользователя — удалились и его токены
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(unique=True)  # sha256, см. core/security.py
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]  # NULL — действует; дата — когда отозван

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")

    def is_valid(self, now: datetime) -> bool:
        return self.revoked_at is None and self.expires_at > now
