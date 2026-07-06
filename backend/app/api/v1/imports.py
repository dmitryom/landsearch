from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...models import Import, ImportSource, User, UserRole
from ...schemas import ImportResponse
from ..deps import get_current_user, require_role
from ...services.importer import process_excel_file

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/excel", response_model=ImportResponse)
async def import_excel(
    file: UploadFile = File(...),
    settlement_id: str | None = None,
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    if not file.filename or not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="Only .xlsx, .xls, .csv files supported")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Max 50 MB.")
    imp = Import(
        tenant_id=current_user.tenant_id,
        source=ImportSource.excel if file.filename.endswith((".xlsx", ".xls")) else ImportSource.csv,
        status="processing",
    )
    session.add(imp)
    await session.flush()

    try:
        result = await process_excel_file(
            session=session,
            tenant_id=current_user.tenant_id,
            file_content=content,
            filename=file.filename,
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

    await session.commit()
    await session.refresh(imp)

    return ImportResponse(
        id=str(imp.id),
        source=imp.source.value,
        status=imp.status,
        total_rows=imp.total_rows or 0,
        success_rows=imp.success_rows or 0,
        error=imp.error,
        created_at=imp.created_at,
    )


@router.get("", response_model=list[ImportResponse])
async def list_imports(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Import)
        .where(Import.tenant_id == current_user.tenant_id)
        .order_by(Import.created_at.desc())
        .limit(50)
    )
    imports = result.scalars().all()
    return [
        ImportResponse(
            id=str(imp.id),
            source=imp.source.value,
            status=imp.status,
            total_rows=imp.total_rows or 0,
            success_rows=imp.success_rows or 0,
            error=imp.error,
            created_at=imp.created_at,
        )
        for imp in imports
    ]
