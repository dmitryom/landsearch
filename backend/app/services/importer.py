import io
import logging
from uuid import UUID

import pandas as pd
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Plot
from .cadastre import enrich_from_cadastre

logger = logging.getLogger(__name__)

STATUS_MAP = {
    "свободен": "free",
    "free": "free",
    "в резерве": "reserved",
    "reserved": "reserved",
    "забронирован": "booked",
    "booked": "booked",
    "продан": "sold",
    "sold": "sold",
}

COLUMN_ALIASES = {
    "cadastral_number": ["cadastral_number", "cad_num", "cadastral", "кадастровый_номер", "кадастровый"],
    "price": ["price", "цена", "cost", "стоимость", "price_rub"],
    "title": ["title", "name", "название", "заголовок", "участок"],
    "status": ["status", "статус"],
    "area_m2": ["area_m2", "area", "площадь", "s", "area_sq_m"],
}


def find_column(keys: list[str], candidates: list[str]) -> str | None:
    for key in keys:
        key_clean = key.strip().lower().replace(" ", "_")
        for c in candidates:
            if key_clean == c.lower():
                return key
    return None


async def process_rows(
    session: AsyncSession,
    tenant_id: UUID,
    rows: list[dict],
    import_id: UUID | None = None,
    settlement_id: str | None = None,
) -> dict:
    if not rows:
        return {"total": 0, "success": 0, "errors": ["No data rows"]}

    keys = list(rows[0].keys())
    cn_col = find_column(keys, COLUMN_ALIASES["cadastral_number"])
    price_col = find_column(keys, COLUMN_ALIASES["price"])
    title_col = find_column(keys, COLUMN_ALIASES["title"])
    status_col = find_column(keys, COLUMN_ALIASES["status"])
    area_col = find_column(keys, COLUMN_ALIASES["area_m2"])

    if not cn_col:
        raise ValueError("Data must contain a column with cadastral numbers")

    total = len(rows)
    success = 0
    errors = []

    for idx, row in enumerate(rows):
        cn = str(row.get(cn_col, "")).strip()
        if not cn or cn == "nan":
            continue

        try:
            price = None
            if price_col:
                val = row.get(price_col)
                if val is not None and val != "":
                    price = float(str(val).replace(" ", "").replace(",", "."))

            area = None
            if area_col:
                val = row.get(area_col)
                if val is not None and val != "":
                    area = float(str(val).replace(" ", "").replace(",", "."))

            status = "free"
            if status_col:
                raw = str(row.get(status_col, "")).strip().lower()
                status = STATUS_MAP.get(raw, "free")

            title = None
            if title_col:
                val = row.get(title_col)
                if val is not None and str(val).strip():
                    title = str(val).strip()

            existing = await session.execute(
                sa_select(Plot).where(
                    Plot.tenant_id == tenant_id,
                    Plot.cadastral_number == cn,
                )
            )
            if existing.scalar_one_or_none():
                errors.append(f"Row {idx + 2}: {cn} already exists")
                continue

            plot = Plot(
                tenant_id=tenant_id,
                cadastral_number=cn,
                price=price,
                area_m2=area,
                status=status,
                title=title,
                settlement_id=UUID(settlement_id) if settlement_id else None,
            )
            session.add(plot)
            await session.flush()

            try:
                await enrich_from_cadastre(session, plot)
            except Exception as e:
                logger.warning("Enrichment failed for %s: %s", cn, e)

            success += 1
        except Exception as e:
            errors.append(f"Row {idx + 2}: {e}")
            logger.warning("Failed to import row %d: %s", idx, e)

    await session.commit()
    return {"total": total, "success": success, "errors": errors}


async def process_excel_file(
    session: AsyncSession,
    tenant_id: UUID,
    file_content: bytes,
    filename: str,
    import_id: UUID | None = None,
    settlement_id: str | None = None,
) -> dict:
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_content))
        else:
            df = pd.read_excel(io.BytesIO(file_content))
    except Exception as e:
        raise ValueError(f"Failed to parse file: {e}")

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    rows = df.to_dict(orient="records")
    return await process_rows(session, tenant_id, rows, import_id, settlement_id)
