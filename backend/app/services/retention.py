import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import delete, update

from ..core.config import settings
from ..core.database import async_session_factory
from ..models import Lead, Reservation


logger = logging.getLogger(__name__)


async def enforce_retention_once() -> tuple[int, int]:
    now = datetime.now(timezone.utc)
    async with async_session_factory() as session:
        deleted = await session.execute(delete(Lead).where(Lead.expires_at <= now))
        anonymized = await session.execute(
            update(Reservation)
            .where(Reservation.pii_expires_at <= now)
            .where(
                (Reservation.buyer_name.is_not(None))
                | (Reservation.buyer_phone.is_not(None))
                | (Reservation.buyer_email.is_not(None))
                | (Reservation.note.is_not(None))
            )
            .values(buyer_name=None, buyer_phone=None, buyer_email=None, note=None)
        )
        await session.commit()
    return deleted.rowcount or 0, anonymized.rowcount or 0


async def retention_worker_loop() -> None:
    while True:
        try:
            deleted, anonymized = await enforce_retention_once()
            if deleted or anonymized:
                logger.info("Retention cleanup: deleted leads=%s, anonymized reservations=%s", deleted, anonymized)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Retention cleanup failed")
        await asyncio.sleep(settings.retention_worker_interval_seconds)
