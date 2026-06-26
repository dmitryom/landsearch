"""Initialize database tables."""
import asyncio
from app.core.database import engine, Base
from app.models import *  # noqa: F401, F403


async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created successfully")


if __name__ == "__main__":
    asyncio.run(init())
