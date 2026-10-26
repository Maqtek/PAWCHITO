"""Эндпоинты /api/admin/clinics: клиники для администратора (контракты, раздел 9).

Порядок проверок: доступ (401/403, зависимость AdminUser), тело (422), поиск клиники (404),
конфликт (409). Сброс пароля клиники — #53.
"""

from fastapi import APIRouter, HTTPException, status
from fastapi.exceptions import RequestValidationError

from app.routers.deps import AdminUser, ClinicServiceDep
from app.schemas.clinic import (
    AdminClinicOut,
    ClinicAccountCreatedOut,
    ClinicAccountIn,
    ClinicArchivedOut,
    ClinicIn,
    ClinicUpdate,
)
from app.schemas.user import UserOut
from app.services.clinics import (
    ClinicAccountConflictError,
    ClinicHoursError,
    ClinicNotFoundError,
)

router = APIRouter(prefix="/admin/clinics", tags=["admin"])


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Клиника не найдена")


@router.get("")
def list_clinics(_: AdminUser, service: ClinicServiceDep) -> list[AdminClinicOut]:
    return [AdminClinicOut.model_validate(clinic) for clinic in service.list_all()]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_clinic(data: ClinicIn, _: AdminUser, service: ClinicServiceDep) -> AdminClinicOut:
    return AdminClinicOut.model_validate(service.create(**data.model_dump()))


@router.get("/{clinic_id}")
def get_clinic(clinic_id: int, _: AdminUser, service: ClinicServiceDep) -> AdminClinicOut:
    try:
        return AdminClinicOut.model_validate(service.get(clinic_id))
    except ClinicNotFoundError:
        raise _not_found() from None


@router.patch("/{clinic_id}")
def update_clinic(
    clinic_id: int, data: ClinicUpdate, _: AdminUser, service: ClinicServiceDep
) -> AdminClinicOut:
    try:
        clinic = service.update(clinic_id, data.model_dump(exclude_unset=True))
    except ClinicNotFoundError:
        raise _not_found() from None
    except ClinicHoursError:
        # Та же форма 422, что у проверки тела: ошибка у поля «Закрытие»
        raise RequestValidationError(
            [
                {
                    "type": "closes_before_opens",
                    "loc": ("body", "closes_at"),
                    "msg": "Закрытие — позже открытия",
                }
            ]
        ) from None
    return AdminClinicOut.model_validate(clinic)


@router.post("/{clinic_id}/archive")
def archive_clinic(clinic_id: int, _: AdminUser, service: ClinicServiceDep) -> ClinicArchivedOut:
    try:
        clinic, cancelled = service.archive(clinic_id)
    except ClinicNotFoundError:
        raise _not_found() from None
    return ClinicArchivedOut(
        clinic=AdminClinicOut.model_validate(clinic), cancelled_appointments=cancelled
    )


@router.post("/{clinic_id}/restore")
def restore_clinic(clinic_id: int, _: AdminUser, service: ClinicServiceDep) -> AdminClinicOut:
    try:
        return AdminClinicOut.model_validate(service.restore(clinic_id))
    except ClinicNotFoundError:
        raise _not_found() from None


@router.post("/{clinic_id}/account", status_code=status.HTTP_201_CREATED)
def create_clinic_account(
    clinic_id: int, data: ClinicAccountIn, _: AdminUser, service: ClinicServiceDep
) -> ClinicAccountCreatedOut:
    try:
        user, temporary_password = service.create_account(clinic_id, data.email)
    except ClinicNotFoundError:
        raise _not_found() from None
    except ClinicAccountConflictError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "У клиники уже есть аккаунт или email занят"
        ) from None
    return ClinicAccountCreatedOut(
        user=UserOut.model_validate(user), temporary_password=temporary_password
    )
