"""Поля авторизации с лимитами из контрактов (раздел 1, «Лимиты полей»).

Длина — в символах Unicode, как len(). Пароли не обрезаем: пробелы — часть пароля.
"""

import re
from typing import Annotated

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, StringConstraints
from pydantic_core import PydanticCustomError

EMAIL_MAX_LENGTH = 254
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
FULL_NAME_MAX_LENGTH = 100

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


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
