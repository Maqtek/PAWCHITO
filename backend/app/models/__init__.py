"""SQLAlchemy ORM-модели — таблицы БД.

Каждую модель импортируем здесь: так Alembic «видит» её в Base.metadata.
"""

from app.models.base import ArchivedMixin, Base, CreatedAtMixin, IdMixin
from app.models.clinic import Clinic
from app.models.enums import UserRole
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.vet import Vet

__all__ = [
    "ArchivedMixin",
    "Base",
    "Clinic",
    "CreatedAtMixin",
    "IdMixin",
    "RefreshToken",
    "User",
    "UserRole",
    "Vet",
]
