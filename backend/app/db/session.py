"""Подключение к базе и сессии.

engine        — «пул соединений» с PostgreSQL, один на всё приложение.
SessionLocal  — фабрика сессий. Сессия = одна единица работы с базой.
get_db        — зависимость FastAPI: одна сессия и ОДНА ТРАНЗАКЦИЯ на запрос.
"""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# Часовой пояс сессии PostgreSQL: timestamptz из базы приходит со смещением Europe/Moscow,
# как требуют контракты («Общие правила»), а не в UTC. Тесты создают движок с теми же
# параметрами.
ENGINE_CONNECT_ARGS = {"options": f"-c timezone={settings.timezone}"}

engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=ENGINE_CONNECT_ARGS)

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
