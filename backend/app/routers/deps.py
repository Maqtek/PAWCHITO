"""Зависимости FastAPI для роутеров."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth import AuthService

DbSession = Annotated[Session, Depends(get_db, scope="function")]


def get_auth_service(db: DbSession) -> AuthService:
    return AuthService(db)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
