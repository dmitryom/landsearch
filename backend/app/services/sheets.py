import logging
from datetime import datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Import, ImportSource, Plot

logger = logging.getLogger(__name__)


class GoogleSheetsService:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key

    async def fetch_sheet(
        self, spreadsheet_id: str, range: str = "A:Z"
    ) -> list[dict]:
        if self.api_key:
            url = (
                f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
                f"/values/{range}?key={self.api_key}"
            )
        else:
            url = (
                f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
                f"/values/{range}"
            )

        async with httpx.AsyncClient() as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        values = data.get("values", [])
        if not values:
            return []

        headers = [h.strip().lower().replace(" ", "_") for h in values[0]]
        return [dict(zip(headers, row)) for row in values[1:]]

    async def import_from_sheet(
        self,
        session: AsyncSession,
        tenant_id,
        spreadsheet_id: str,
        range: str = "A:Z",
        settlement_id: str | None = None,
    ) -> dict:
        rows = await self.fetch_sheet(spreadsheet_id, range)
        from .importer import process_rows

        imp = Import(
            tenant_id=tenant_id,
            source=ImportSource.google_sheets,
            status="processing",
            import_data={"spreadsheet_id": spreadsheet_id, "range": range},
        )
        session.add(imp)
        await session.flush()

        try:
            result = await process_rows(
                session=session,
                tenant_id=tenant_id,
                rows=rows,
                import_id=imp.id,
                settlement_id=settlement_id,
            )
            imp.status = "completed"
            imp.total_rows = result["total"]
            imp.success_rows = result["success"]
            imp.completed_at = datetime.now()
        except Exception as e:
            imp.status = "failed"
            imp.error = str(e)
            logger.exception("Google Sheets import failed")

        await session.commit()
        return {
            "id": str(imp.id),
            "status": imp.status,
            "total": imp.total_rows or 0,
            "success": imp.success_rows or 0,
            "error": imp.error,
        }


class YandexTableService:
    def __init__(self, oauth_token: str | None = None):
        self.oauth_token = oauth_token

    async def fetch_table(self, table_id: str) -> list[dict]:
        headers = {"Authorization": f"OAuth {self.oauth_token}"} if self.oauth_token else {}
        url = f"https://api.yandex.net/direct/table/{table_id}"

        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        rows = data.get("rows", [])
        headers_list = data.get("headers", [])
        if not headers_list:
            return rows if isinstance(rows, list) and rows and isinstance(rows[0], dict) else []

        headers_clean = [h.strip().lower().replace(" ", "_") for h in headers_list]
        return [dict(zip(headers_clean, row)) for row in rows]

    async def import_from_table(
        self,
        session: AsyncSession,
        tenant_id,
        table_id: str,
        settlement_id: str | None = None,
    ) -> dict:
        rows = await self.fetch_table(table_id)
        from .importer import process_rows

        imp = Import(
            tenant_id=tenant_id,
            source=ImportSource.yandex_table,
            status="processing",
            import_data={"table_id": table_id},
        )
        session.add(imp)
        await session.flush()

        try:
            result = await process_rows(
                session=session,
                tenant_id=tenant_id,
                rows=rows,
                import_id=imp.id,
                settlement_id=settlement_id,
            )
            imp.status = "completed"
            imp.total_rows = result["total"]
            imp.success_rows = result["success"]
            imp.completed_at = datetime.now()
        except Exception as e:
            imp.status = "failed"
            imp.error = str(e)
            logger.exception("Yandex Table import failed")

        await session.commit()
        return {
            "id": str(imp.id),
            "status": imp.status,
            "total": imp.total_rows or 0,
            "success": imp.success_rows or 0,
            "error": imp.error,
        }
