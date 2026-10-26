"""Клиники для администратора: список, создание, изменение, скрытие и возврат (раздел 9).

HTTP не знает: ошибки — свои исключения, роутер превращает их в коды ответа.
"""

from collections.abc import Sequence
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import generate_temporary_password, hash_password
from app.models import Clinic, User, UserRole
from app.repositories.clinic import ClinicRepository
from app.repositories.refresh_token import RefreshTokenRepository
from app.repositories.user import UserRepository
from app.services.rate_limit import AttemptLimiter


class ClinicNotFoundError(Exception):
    pass


class ClinicHoursError(Exception):
    """Открытие не раньше закрытия — по итоговым значениям после PATCH."""


class ClinicAccountConflictError(Exception):
    """У клиники уже есть аккаунт или email занят — 409, без уточнения (контракты, раздел 9)."""


class ClinicService:
    def __init__(self, session: Session, limiter: AttemptLimiter) -> None:
        self.clinics = ClinicRepository(session)
        self.users = UserRepository(session)
        self.refresh_tokens = RefreshTokenRepository(session)
        self.limiter = limiter

    def list_all(self) -> Sequence[Clinic]:
        """Все клиники, включая скрытые."""
        return self.clinics.list_all()

    def get(self, clinic_id: int) -> Clinic:
        clinic = self.clinics.get(clinic_id)
        if clinic is None:
            raise ClinicNotFoundError
        return clinic

    def create(self, **fields: Any) -> Clinic:
        return self.clinics.create(**fields)

    def update(self, clinic_id: int, changes: dict[str, Any]) -> Clinic:
        """Только присланные поля. Существующие записи не меняются — новые слоты
        считаются по новым часам (контракты, раздел 9).
        """
        clinic = self.get(clinic_id)
        opens_at = changes.get("opens_at", clinic.opens_at)
        closes_at = changes.get("closes_at", clinic.closes_at)
        if opens_at >= closes_at:
            raise ClinicHoursError
        return self.clinics.update(clinic, **changes) if changes else clinic

    def archive(self, clinic_id: int) -> tuple[Clinic, int]:
        """Скрыть клинику. Возвращает клинику и число отменённых записей.

        Аккаунт клиники блокируется, его сессии завершаются (Р-36). Повторно — без изменений.
        Будущие записи и уведомления владельцам появятся на этапе 7: пока отменять нечего.
        """
        clinic = self.get(clinic_id)
        if clinic.is_archived:
            return clinic, 0
        clinic.archived_at = datetime.now(ZoneInfo(settings.timezone))
        if clinic.account is not None:
            clinic.account.is_active = False
            self.refresh_tokens.delete_all_for_user(clinic.account.id)
        self.clinics.session.flush()
        return clinic, 0

    def restore(self, clinic_id: int) -> Clinic:
        """Вернуть клинику: аккаунт разблокирован, отменённые записи не возвращаются.
        Возврат нескрытой клиники — без изменений (Р-36).
        """
        clinic = self.get(clinic_id)
        if not clinic.is_archived:
            return clinic
        clinic.archived_at = None
        if clinic.account is not None:
            clinic.account.is_active = True
        self.clinics.session.flush()
        return clinic

    def create_account(self, clinic_id: int, email: str) -> tuple[User, str]:
        """Аккаунт клиники с временным паролем: при первом входе его нужно сменить.

        Возвращает пользователя и пароль — он показывается один раз, в базе только хеш.
        У скрытой клиники аккаунт сразу заблокирован (Р-36). full_name не заполняется:
        имя в ответах — название клиники (Р-35).
        """
        clinic = self.get(clinic_id)
        if clinic.user_id is not None:
            raise ClinicAccountConflictError
        temporary_password = generate_temporary_password()
        try:
            user = self.users.create(
                email=email,
                password_hash=hash_password(temporary_password),
                role=UserRole.clinic,
                must_change_password=True,
                is_active=not clinic.is_archived,
            )
        except IntegrityError:
            # email уже занят — уникальный индекс по lower(email); откат сделает get_db
            raise ClinicAccountConflictError from None
        # через связь, а не user_id: так user.clinic сразу знает клинику для display_name
        clinic.account = user
        self.clinics.session.flush()
        # Пауза могла остаться от попыток входа с этим email до создания аккаунта
        self.limiter.reset(email)
        return user, temporary_password
