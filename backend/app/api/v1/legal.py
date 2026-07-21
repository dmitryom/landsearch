from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...models import TenantLegalProfile
from ...schemas import LegalProfileResponse
from ..deps import get_tenant_scope_optional


router = APIRouter(prefix="/legal", tags=["legal"])


def legal_profile_response(profile: TenantLegalProfile | None) -> LegalProfileResponse:
    if profile is None:
        return LegalProfileResponse()
    values = {
        field: getattr(profile, field)
        for field in LegalProfileResponse.model_fields
        if field != "is_complete" and hasattr(profile, field)
    }
    values["is_complete"] = all(
        getattr(profile, field, None)
        for field in ("operator_name", "inn", "address", "email", "policy_effective_date")
    ) and bool(profile.rkn_registry_number or profile.rkn_exemption_reason)
    return LegalProfileResponse(**values)


@router.get("", response_model=LegalProfileResponse)
async def get_public_legal_profile(
    tenant_id=Depends(get_tenant_scope_optional),
    session: AsyncSession = Depends(get_session),
):
    if tenant_id is None:
        return legal_profile_response(None)
    profile = (await session.execute(select(TenantLegalProfile).where(
        TenantLegalProfile.tenant_id == tenant_id
    ))).scalar_one_or_none()
    return legal_profile_response(profile)
