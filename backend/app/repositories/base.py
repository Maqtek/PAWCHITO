"""BaseRepository — общие операции с базой для всех таблиц.

Паттерн «Репозиторий»: сервисы не пишут запросы сами, а просят репозиторий
«дай питомца 5» или «создай запись». Весь SQLAlchemy-код живёт здесь.

    class PetRepository(BaseRepository[Pet]):
        model = Pet

Репозиторий НЕ делает commit(): транзакцией управляет get_db() — один запрос
к API = одна транзакция. Поэтому, например, итог приёма сохраняется целиком или никак.
"""

from collections.abc import Sequence
from typing import Any, Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    model: type[ModelT]  # задаётся в наследнике: model = Pet

    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, **data: Any) -> ModelT:
        """repo.create(name="Барсик", owner_id=3) -> INSERT, вернёт объект с id."""
        obj = self.model(**data)
        self.session.add(obj)
        self.session.flush()  # отправить INSERT сейчас, чтобы получить obj.id
        return obj

    def get(self, obj_id: int) -> ModelT | None:
        """Объект по id или None, если такого нет."""
        return self.session.get(self.model, obj_id)

    def list(self, *where: Any, limit: int = 100, offset: int = 0) -> Sequence[ModelT]:
        """repo.list(Pet.owner_id == 3) -> список с фильтром и постраничностью."""
        stmt = select(self.model).where(*where).limit(limit).offset(offset)
        return self.session.scalars(stmt).all()

    def update(self, obj: ModelT, **data: Any) -> ModelT:
        """repo.update(pet, name="Мурзик") -> UPDATE только переданных полей."""
        for field, value in data.items():
            if not hasattr(self.model, field):
                raise AttributeError(f"{self.model.__name__} has no field {field!r}")
            setattr(obj, field, value)
        self.session.flush()
        return obj

    def delete(self, obj: ModelT) -> None:
        self.session.delete(obj)
        self.session.flush()
