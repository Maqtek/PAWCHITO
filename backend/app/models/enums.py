"""Перечисления. Каждое становится типом ENUM в PostgreSQL.

Значения — как в контрактах API и глоссарии.
"""

import enum

from sqlalchemy import Enum


class UserRole(enum.StrEnum):
    owner = "owner"
    clinic = "clinic"
    admin = "admin"


def pg_enum(py_enum: type[enum.Enum], name: str) -> Enum:
    """Тип колонки: хранить в БД значения ("owner"), а не имена членов enum."""
    return Enum(py_enum, name=name, values_callable=lambda e: [m.value for m in e])


user_role = pg_enum(UserRole, "user_role")
