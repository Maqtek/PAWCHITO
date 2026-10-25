from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from app.core.logging import setup_logging
from app.core.middleware import RequestLogMiddleware
from app.core.validation import validation_exception_handler
from app.routers.auth import router as auth_router
from app.routers.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    listener = setup_logging()
    yield
    listener.stop()  # дописывает то, что осталось в очереди


app = FastAPI(title="PAWCHITO", lifespan=lifespan)
app.add_middleware(RequestLogMiddleware)
app.add_exception_handler(RequestValidationError, validation_exception_handler)

app.include_router(health_router)
# Префикс /api: прокси фронта шлёт запросы как есть, cookie выставлена на /api/auth
app.include_router(auth_router, prefix="/api")
