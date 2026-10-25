"""Запросы к таблице users."""

from sqlalchemy import func, select

from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    def get_by_email(self, email: str) -> User | None:
        """Поиск без учёта регистра — по тому же lower(email), что и уникальный индекс."""
        stmt = select(User).where(func.lower(User.email) == email.strip().lower())
        return self.session.scalars(stmt).one_or_none()
