from uuid import UUID

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.database import get_session
from ..models import User, UserRole

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return await _resolve_user(credentials.credentials, session)


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    if credentials is None:
        return None
    try:
        return await _resolve_user(credentials.credentials, session)
    except HTTPException:
        return None


async def _resolve_user(token: str, session: AsyncSession) -> User:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await session.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


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
