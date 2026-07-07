from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .api.v1 import auth, imports, layers, leads, plots, search, settlements, sheets_import
from .core.config import settings
from .core.database import engine
from .core.middleware import RequestLoggingMiddleware, SecurityHeadersMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting LandSearch API")
    yield
    logger.info("Shutting down LandSearch API")
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(plots.router, prefix="/api/v1")
app.include_router(settlements.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")
app.include_router(imports.router, prefix="/api/v1")
app.include_router(layers.router, prefix="/api/v1")
app.include_router(leads.router, prefix="/api/v1")
app.include_router(sheets_import.router, prefix="/api/v1")


@app.get("/metrics")
async def metrics():
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    return PlainTextResponse(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )


@app.get("/health")
async def health(request: Request):
    from sqlalchemy import text
    from .core.database import async_session_factory

    checks = {"status": "ok", "version": "0.1.0", "services": {}}

    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        checks["services"]["postgres"] = "ok"
    except Exception as e:
        checks["services"]["postgres"] = f"error: {str(e)[:80]}"
        checks["status"] = "degraded"

    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.aclose()
        checks["services"]["redis"] = "ok"
    except Exception as e:
        checks["services"]["redis"] = f"error: {str(e)[:80]}"
        checks["status"] = "degraded"

    return checks
