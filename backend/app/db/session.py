"""Подключение к базе и сессии.

engine        — «пул соединений» с PostgreSQL, один на всё приложение.
SessionLocal  — фабрика сессий. Сессия = одна единица работы с базой.
get_db        — зависимость FastAPI: одна сессия и ОДНА ТРАНЗАКЦИЯ на запрос.
"""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Использование в роутере:  def handler(db: Session = Depends(get_db)): ...

    SessionLocal.begin() открывает транзакцию:
      * запрос отработал без ошибок -> COMMIT (всё сохраняется);
      * вылетело исключение          -> ROLLBACK (не сохраняется ничего).
    Поэтому репозитории и сервисы сами commit() не вызывают.
    """
    with SessionLocal.begin() as session:
        yield session
