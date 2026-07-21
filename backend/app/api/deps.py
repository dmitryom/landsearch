from uuid import UUID

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.database import get_session
from ..core.security import decode_access_token
from ..models import Tenant, User, UserRole

security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> User:
    token = credentials.credentials if credentials else request.cookies.get("landsearch_session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return await _resolve_user(token, session)


async def get_current_user_optional(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    token = credentials.credentials if credentials else request.cookies.get("landsearch_session")
    if not token:
        return None
    try:
        return await _resolve_user(token, session)
    except HTTPException:
        return None


async def _resolve_user(token: str, session: AsyncSession) -> User:
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        user_uuid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await session.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


async def get_tenant_scope_optional(
    current_user: User | None = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_session),
) -> UUID | None:
    if current_user:
        return current_user.tenant_id
    if not settings.public_tenant_slug:
        return None

    result = await session.execute(
        select(Tenant.id).where(
            Tenant.slug == settings.public_tenant_slug,
            Tenant.is_active,
        )
    )
    return result.scalar_one_or_none()


def require_role(role: UserRole):
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        role_rank = {
            UserRole.buyer: 0,
            UserRole.manager: 1,
            UserRole.admin: 2,
            UserRole.superadmin: 3,
        }
        if role_rank.get(current_user.role, -1) < role_rank.get(role, 0):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return _check
