"""Initialize database tables."""
import asyncio
from app.core.database import engine, Base
from app.models import *  # noqa: F401, F403
from sqlalchemy import text


async def init():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created successfully")


if __name__ == "__main__":
    asyncio.run(init())
