from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_session
from ...models import User
from ...services.sheets import GoogleSheetsService, YandexTableService
from ..deps import get_current_user, require_role

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/google-sheets")
async def import_google_sheets(
    spreadsheet_id: str,
    range: str = "A:Z",
    settlement_id: str | None = None,
    current_user: User = Depends(require_role),
    session: AsyncSession = Depends(get_session),
):
    api_key = settings.google_credentials_file
    svc = GoogleSheetsService(api_key=api_key)
    result = await svc.import_from_sheet(
        session=session,
        tenant_id=current_user.tenant_id,
        spreadsheet_id=spreadsheet_id,
        range=range,
        settlement_id=settlement_id,
    )
    return result


@router.post("/yandex-table")
async def import_yandex_table(
    table_id: str,
    settlement_id: str | None = None,
    current_user: User = Depends(require_role),
    session: AsyncSession = Depends(get_session),
):
    token = settings.yandex_oauth_token
    if not token:
        raise HTTPException(status_code=400, detail="Yandex OAuth token not configured")
    svc = YandexTableService(oauth_token=token)
    result = await svc.import_from_table(
        session=session,
        tenant_id=current_user.tenant_id,
        table_id=table_id,
        settlement_id=settlement_id,
    )
    return result
