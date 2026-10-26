"""Выгрузка OpenAPI-схемы в backend/openapi.json — из неё фронт генерирует типы (pnpm gen:api).

    python -m app.export_openapi           # записать файл
    python -m app.export_openapi --check   # CI: файл устарел — код выхода 1

Пути в файле — без префикса /api, он вынесен в servers: так они совпадают с клиентом фронта
(`api.POST('/auth/login')` при baseUrl '/api'). Служебные пути вне /api (например, /health)
в схему не попадают: фронт их не вызывает.
"""

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

from app.main import API_PREFIX, app

OPENAPI_PATH = Path(__file__).resolve().parents[1] / "openapi.json"
FIX_HINT = "выполните `python -m app.export_openapi` в папке backend и закоммитьте файл"


def build_schema() -> dict[str, Any]:
    # app.openapi() кэширует схему — меняем копию
    schema = copy.deepcopy(app.openapi())
    schema["servers"] = [{"url": API_PREFIX}]
    schema["paths"] = {
        path.removeprefix(API_PREFIX): operations
        for path, operations in schema["paths"].items()
        if path.startswith(f"{API_PREFIX}/")
    }
    return schema


def render() -> str:
    # Порядок ключей — как у FastAPI (в порядке подключения роутеров), отступы и \n в конце:
    # тогда в diff видно только то, что действительно изменилось в API
    return json.dumps(build_schema(), ensure_ascii=False, indent=2) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.export_openapi", description=__doc__.splitlines()[0]
    )
    parser.add_argument(
        "--check", action="store_true", help="не записывать, а проверить, что файл актуален"
    )
    args = parser.parse_args(argv)

    content = render()
    if args.check:
        if not OPENAPI_PATH.exists():
            print(f"{OPENAPI_PATH.name} нет: {FIX_HINT}", file=sys.stderr)
            return 1
        if OPENAPI_PATH.read_text(encoding="utf-8") != content:
            print(f"{OPENAPI_PATH.name} устарел: {FIX_HINT}", file=sys.stderr)
            return 1
        print(f"{OPENAPI_PATH.name} актуален")
        return 0

    OPENAPI_PATH.write_text(content, encoding="utf-8")
    print(f"Схема записана в {OPENAPI_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
