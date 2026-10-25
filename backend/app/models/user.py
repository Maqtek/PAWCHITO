"""Пользователь любой роли: владелец, аккаунт клиники, администратор (этап 2)."""

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Index, false, func, text, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, IdMixin
from app.models.enums import UserRole, user_role

if TYPE_CHECKING:
    from app.models.refresh_token import RefreshToken


class User(IdMixin, CreatedAtMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        # код восстановления есть только у владельца
        CheckConstraint("recovery_code_hash IS NULL OR role = 'owner'", name="recovery_owner"),
        # email уникален без учёта регистра: Anna@mail.ru и anna@mail.ru — один адрес.
        # text("email") — ссылка на колонку; просто "email" стал бы строкой: lower('email')
        Index("uq_users_email", func.lower(text("email")), unique=True),
    )

    email: Mapped[str]
    password_hash: Mapped[str]  # хеш Argon2, не сам пароль
    role: Mapped[UserRole] = mapped_column(user_role, server_default=UserRole.owner.value)
    full_name: Mapped[str | None]
    is_active: Mapped[bool] = mapped_column(server_default=true())  # False — вход заблокирован
    must_change_password: Mapped[bool] = mapped_column(server_default=false())
    recovery_code_hash: Mapped[str | None]

    # passive_deletes: токены удаляет сама база (ON DELETE CASCADE),
    # иначе SQLAlchemy попытается поставить им user_id = NULL и упадёт на NOT NULL
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", passive_deletes=True
    )

    def __repr__(self) -> str:
        return f"<User {self.id} {self.email} {self.role.value}>"
