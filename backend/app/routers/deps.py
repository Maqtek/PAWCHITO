"""Зависимости FastAPI для роутеров."""

from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy.orm import Session

from app.core.cookies import REFRESH_COOKIE_NAME
from app.db.session import get_db
from app.services.auth import AuthService

DbSession = Annotated[Session, Depends(get_db, scope="function")]


def get_auth_service(db: DbSession) -> AuthService:
    return AuthService(db)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]

# Приходит только на /api/auth/* (Path cookie), в других роутерах всегда None
RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)]
