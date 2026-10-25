"""Запросы к таблице refresh_tokens."""

from datetime import datetime

from sqlalchemy import select, update

from app.models.refresh_token import RefreshToken
from app.repositories.base import BaseRepository


class RefreshTokenRepository(BaseRepository[RefreshToken]):
    model = RefreshToken

    def get_by_hash(self, token_hash: str, *, for_update: bool = False) -> RefreshToken | None:
        """Токен по хешу из cookie: hash_refresh_token(cookie) из core/security.py.

        for_update=True блокирует строку до конца транзакции (SELECT ... FOR UPDATE):
        два одновременных refresh одним токеном не выпустят две новые сессии —
        второй дождётся первого и увидит, что токен уже отозван.
        """
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        if for_update:
            stmt = stmt.with_for_update()
        return self.session.scalars(stmt).one_or_none()

    def revoke(self, token: RefreshToken, now: datetime) -> None:
        """Отозвать один токен: выход, обмен на новый (ротация)."""
        token.revoked_at = now
        self.session.flush()

    def revoke_all_for_user(self, user_id: int, now: datetime) -> None:
        """Отозвать все действующие токены пользователя — завершить все сессии.

        Смена пароля, сброс по коду, блокировка, повторное использование
        отозванного токена.
        """
        stmt = (
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
            .execution_options(synchronize_session="fetch")
        )
        self.session.execute(stmt)
