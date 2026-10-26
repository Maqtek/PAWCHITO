"""Базовый класс всех моделей и общие миксины."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Identity, MetaData, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Единые правила имён для ограничений и индексов.
# Без них PostgreSQL придумывает имена сам, и миграции с удалением
# ограничений у разных людей ломаются.
NAMING_CONVENTION = {
    "pk": "pk_%(table_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
}


class Base(DeclarativeBase):
    """Родитель всех моделей. Alembic смотрит на Base.metadata."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    # Какой тип БД брать для аннотаций Python по умолчанию
    type_annotation_map = {
        int: BigInteger(),
        str: Text(),
        datetime: DateTime(timezone=True),  # timestamptz
    }


class IdMixin:
    """id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY"""

    id: Mapped[int] = mapped_column(Identity(always=True), primary_key=True, sort_order=-10)


class CreatedAtMixin:
    """created_at timestamptz NOT NULL DEFAULT now()"""

    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), sort_order=10)


class ArchivedMixin:
    """archived_at timestamptz — архив вместо удаления: NULL — активен, дата — когда скрыт."""

    archived_at: Mapped[datetime | None] = mapped_column(sort_order=9)

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None
