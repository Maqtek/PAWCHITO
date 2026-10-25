"""Профиль пользователя."""

from sqlalchemy.orm import Session

from app.models import User
from app.repositories.user import UserRepository


class UserService:
    def __init__(self, session: Session) -> None:
        self.users = UserRepository(session)

    def update_profile(self, user: User, full_name: str) -> User:
        """Меняется только имя: email и роль не редактируются."""
        return self.users.update(user, full_name=full_name)