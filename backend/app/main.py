from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.logging import setup_logging
from app.core.middleware import RequestLogMiddleware
from app.routers.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    listener = setup_logging()
    yield
    listener.stop()  # дописывает то, что осталось в очереди


app = FastAPI(title="PAWCHITO", lifespan=lifespan)
app.add_middleware(RequestLogMiddleware)

app.include_router(health_router)
