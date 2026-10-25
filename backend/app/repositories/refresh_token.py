"""Запросы к таблице refresh_tokens."""

from datetime import datetime

from sqlalchemy import delete, select

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
        """Пометить токен заменённым при обмене (ротация).

        Только для ротации: повторное предъявление токена с revoked_at сервис считает
        кражей (AuthService.refresh). Законно завершённые сессии — delete_all_for_user.
        """
        token.revoked_at = now
        self.session.flush()

    def delete_all_for_user(self, user_id: int) -> None:
        """Завершить все сессии пользователя: удалить его refresh-токены.

        Смена пароля, восстановление по коду, кража токена, блокировка.
        Удаляем, а не ставим revoked_at: иначе другое устройство, обменивая свой
        законно отозванный токен, попало бы под «повторное использование» и
        завершило бы и новую сессию.
        """
        self.session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
