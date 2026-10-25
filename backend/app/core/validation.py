"""Ответ 422 с русскими текстами (контракты, «Общие правила»).

Формат FastAPI сохраняем: {"detail": [{"type", "loc", "msg", "ctx"}]}.
Поле "input" не отдаём: в нём было бы введённое значение, в том числе пароль.
"""

from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

FIELD_NAMES = {
    "email": "Email",
    "password": "Пароль",
    "new_password": "Пароль",
    "current_password": "Пароль",
    "full_name": "Имя",
    "recovery_code": "Код",
}


def _message(error: dict[str, Any]) -> str:
    loc = error.get("loc") or ()
    field = FIELD_NAMES.get(str(loc[-1]), "Поле") if loc else "Поле"
    ctx = error.get("ctx") or {}
    match error["type"]:
        case "missing":
            return "Заполните поле"
        case "string_type":
            return f"{field}: ожидается строка"
        case "string_too_short" if ctx.get("min_length") == 1:
            return f"{field} не может быть пустым"
        case "string_too_short":
            return f"{field} — не короче {ctx['min_length']} символов"
        case "string_too_long":
            return f"{field} — не длиннее {ctx['max_length']} символов"
        case "json_invalid":
            return "Тело запроса — не JSON"
        case "model_attributes_type" | "dict_type":
            return "Тело запроса должно быть объектом"
    # Наши PydanticCustomError уже с русским текстом
    return str(error["msg"])


def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Тип Exception, а не RequestValidationError, — иначе mypy ругается на add_exception_handler
    assert isinstance(exc, RequestValidationError)
    detail = [
        {"type": e["type"], "loc": e["loc"], "msg": _message(e), "ctx": e.get("ctx")}
        for e in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(detail)})
