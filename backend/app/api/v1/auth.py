from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_session
from ...core.exceptions import ConflictException, UnauthorizedException
from ...core.security import create_access_token, create_refresh_token, decode_refresh_token, hash_password, verify_password
from ...models import Tenant, User, UserRole
from ...schemas import LoginRequest, RefreshTokenRequest, TokenResponse, UserCreate, UserResponse
from ..deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response | None, access_token: str) -> None:
    if response is None:
        return
    response.set_cookie(
        key="landsearch_session",
        value=access_token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )

def _build_token_response(user: User) -> TokenResponse:
    token_data = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=UserResponse(
            id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
            is_active=user.is_active,
        ),
    )


@router.post("/register", response_model=TokenResponse)
async def register(body: UserCreate, response: Response = None, session: AsyncSession = Depends(get_session)):
    existing = await session.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise ConflictException("Email already registered")

    import uuid as _uuid
    tenant = Tenant(
        name=f"{body.full_name or body.email}'s Company",
        slug=_uuid.uuid4().hex[:12],
    )
    session.add(tenant)
    await session.flush()

    user = User(
        tenant_id=tenant.id,
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=UserRole.buyer,
        terms_accepted_at=datetime.now(timezone.utc),
        terms_version=body.terms_version,
    )
    session.add(user)
    await session.commit()

    tokens = _build_token_response(user)
    _set_session_cookie(response, tokens.access_token)
    return tokens


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, response: Response = None, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise UnauthorizedException("Invalid email or password")

    tokens = _build_token_response(user)
    _set_session_cookie(response, tokens.access_token)
    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshTokenRequest, response: Response = None, session: AsyncSession = Depends(get_session)):
    payload = decode_refresh_token(body.refresh_token)
    if payload is None:
        raise UnauthorizedException("Invalid or expired refresh token")

    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedException("Invalid token payload")

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise UnauthorizedException("User not found or inactive")

    tokens = _build_token_response(user)
    _set_session_cookie(response, tokens.access_token)
    return tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response):
    response.delete_cookie(
        key="landsearch_session",
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.value,
        is_active=current_user.is_active,
    )
