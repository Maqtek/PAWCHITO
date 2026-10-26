"""Поля с лимитами из контрактов: авторизация (раздел 1), клиника (раздел 9).

Длина — в символах Unicode, как len(). Пароли не обрезаем: пробелы — часть пароля.
"""

import re
from datetime import time
from typing import Annotated, Any

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, BeforeValidator, PlainSerializer, StringConstraints
from pydantic_core import PydanticCustomError

from app.core.security import normalize_recovery_code

EMAIL_MAX_LENGTH = 254
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
FULL_NAME_MAX_LENGTH = 100
RECOVERY_CODE_MAX_LENGTH = 64
CLINIC_NAME_MAX_LENGTH = 100
CLINIC_ADDRESS_MAX_LENGTH = 200

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_RECOVERY_CODE = re.compile(r"[A-Z0-9]{4}(-[A-Z0-9]{4}){3}")
_PHONE = re.compile(r"\+7\d{10}")
# Р-33: ровно ЧЧ:ММ, минуты 00 или 30, в пределах суток — 9:00, 09:00:00, 24:00 не проходят
_HALF_HOUR = re.compile(r"([01]\d|2[0-3]):(00|30)")


def _check_email_format(value: str) -> str:
    try:
        validate_email(value, check_deliverability=False)
    except EmailNotValidError:
        raise PydanticCustomError("email_invalid", "Неверный формат email") from None
    return value


def _check_no_control_chars(value: str) -> str:
    if _CONTROL_CHARS.search(value):
        raise PydanticCustomError("control_chars", "Имя содержит недопустимые символы")
    return value


def _normalize_recovery_code(value: str) -> str:
    # Регистр и разделители не важны (контракты, «Лимиты полей»); isalnum() пропустил бы
    # и кириллицу, поэтому после нормализации — строгая проверка латиницей
    code = normalize_recovery_code(value)
    if not _RECOVERY_CODE.fullmatch(code):
        raise PydanticCustomError("recovery_code_invalid", "Код в формате XXXX-XXXX-XXXX-XXXX")
    return code


# Вход и восстановление: формат не проверяем — неверная пара и так даст 401/400.
LoginEmail = Annotated[
    str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=EMAIL_MAX_LENGTH)
]
# Регистрация и аккаунт клиники: ещё и формат.
NewEmail = Annotated[LoginEmail, AfterValidator(_check_email_format)]

# Вход и проверка текущего пароля: только верхняя граница, чтобы не хешировать мегабайты.
CurrentPassword = Annotated[str, StringConstraints(max_length=PASSWORD_MAX_LENGTH)]
NewPassword = Annotated[
    str, StringConstraints(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
]

FullName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=FULL_NAME_MAX_LENGTH),
    AfterValidator(_check_no_control_chars),
]
RecoveryCode = Annotated[
    str,
    StringConstraints(max_length=RECOVERY_CODE_MAX_LENGTH),
    AfterValidator(_normalize_recovery_code),
]


# --- Клиника (раздел 9, Р-33, Р-34) ---


def _text_without_control_chars(value: str) -> str:
    if _CONTROL_CHARS.search(value):
        raise PydanticCustomError("control_chars", "Текст содержит недопустимые символы")
    return value


def _check_phone(value: str) -> str:
    # Сервер не нормализует: пробелы, скобки и ведущую 8 убирает фронт (Р-34)
    if not _PHONE.fullmatch(value):
        raise PydanticCustomError("phone_invalid", "Телефон: +7 и 10 цифр")
    return value


def _parse_half_hour(value: str) -> time:
    if not _HALF_HOUR.fullmatch(value):
        raise PydanticCustomError("time_invalid", "Время ЧЧ:ММ с шагом 30 минут")
    return time.fromisoformat(value)


def _check_work_days(value: Any) -> list[int]:
    if not isinstance(value, list) or not value:
        raise PydanticCustomError("work_days_empty", "Нужен хотя бы один рабочий день")
    # type(), а не isinstance: True — тоже int; 1.0 и «1» не проходят
    if not all(type(day) is int and 1 <= day <= 7 for day in value):
        raise PydanticCustomError("work_days_invalid", "Рабочие дни — числа от 1 до 7")
    if len(set(value)) != len(value):
        raise PydanticCustomError("work_days_duplicates", "Рабочие дни не должны повторяться")
    return sorted(value)  # Р-34: ответ — по порядку дней


ClinicName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=CLINIC_NAME_MAX_LENGTH),
    AfterValidator(_text_without_control_chars),
]
ClinicAddress = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=CLINIC_ADDRESS_MAX_LENGTH),
    AfterValidator(_text_without_control_chars),
]
Phone = Annotated[str, AfterValidator(_check_phone)]
# На входе строка «ЧЧ:ММ», внутри — datetime.time
HalfHour = Annotated[str, AfterValidator(_parse_half_hour)]
# В ответе — снова «ЧЧ:ММ», а не «09:00:00», как отдал бы Pydantic
TimeOut = Annotated[time, PlainSerializer(lambda value: value.strftime("%H:%M"), return_type=str)]
# BeforeValidator: свои русские ошибки вместо проверки по элементам списка
WorkDays = Annotated[list[int], BeforeValidator(_check_work_days)]


def _reject_null(value: Any) -> Any:
    if value is None:
        raise PydanticCustomError("null_not_allowed", "null не допускается")
    return value


# PATCH: поле можно не присылать, но явный null — 422, а не «не менять» (Р-34)
NotNull = BeforeValidator(_reject_null)
