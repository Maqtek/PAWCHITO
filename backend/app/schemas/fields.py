"""Поля авторизации с лимитами из контрактов (раздел 1, «Лимиты полей»).

Длина — в символах Unicode, как len(). Пароли не обрезаем: пробелы — часть пароля.
"""

import re
from typing import Annotated

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, StringConstraints
from pydantic_core import PydanticCustomError

from app.core.security import normalize_recovery_code

EMAIL_MAX_LENGTH = 254
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
FULL_NAME_MAX_LENGTH = 100
RECOVERY_CODE_MAX_LENGTH = 64

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_RECOVERY_CODE = re.compile(r"[A-Z0-9]{4}(-[A-Z0-9]{4}){3}")


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
