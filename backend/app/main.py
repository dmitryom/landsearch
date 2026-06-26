from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1 import auth, imports, leads, plots, search, settlements, sheets_import
from .core.config import settings
from .core.database import engine, Base

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        logger.warning("Table creation (if needed): %s", e)
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(plots.router, prefix="/api/v1")
app.include_router(settlements.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")
app.include_router(imports.router, prefix="/api/v1")
app.include_router(leads.router, prefix="/api/v1")
app.include_router(sheets_import.router, prefix="/api/v1")


@app.get("/health")
async def health():
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
