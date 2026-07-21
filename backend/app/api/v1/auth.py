from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_session
from ...core.exceptions import ConflictException, UnauthorizedException
from ...core.security import create_access_token, create_refresh_token, decode_refresh_token, hash_password, verify_password
from ...models import Lead, Reservation, Tenant, User, UserRole
from ...schemas import LoginRequest, RefreshTokenRequest, SessionResponse, UserCreate, UserResponse
from ..deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookies(response: Response | None, access_token: str, refresh_token: str) -> None:
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
    response.set_cookie(
        key="landsearch_refresh",
        value=refresh_token,
        max_age=30 * 24 * 60 * 60,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        path="/api/v1/auth",
    )

def _build_session_response(user: User, response: Response | None) -> SessionResponse:
    token_data = {"sub": str(user.id)}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    _set_session_cookies(response, access_token, refresh_token)
    return SessionResponse(
        user=UserResponse(
            id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
            is_active=user.is_active,
        ),
    )


@router.post("/register", response_model=SessionResponse)
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

    return _build_session_response(user, response)


@router.post("/login", response_model=SessionResponse)
async def login(body: LoginRequest, response: Response = None, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise UnauthorizedException("Invalid email or password")

    return _build_session_response(user, response)


@router.post("/refresh", response_model=SessionResponse)
async def refresh(
    request: Request,
    response: Response = None,
    body: RefreshTokenRequest | None = None,
    session: AsyncSession = Depends(get_session),
):
    refresh_token = (body.refresh_token if body else None) or request.cookies.get("landsearch_refresh")
    payload = decode_refresh_token(refresh_token) if refresh_token else None
    if payload is None:
        raise UnauthorizedException("Invalid or expired refresh token")

    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedException("Invalid token payload")

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise UnauthorizedException("User not found or inactive")

    return _build_session_response(user, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response):
    response.delete_cookie(
        key="landsearch_session",
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    response.delete_cookie(
        key="landsearch_refresh",
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        path="/api/v1/auth",
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


@router.get("/me/export")
async def export_my_data(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the authenticated subject's account and contact records."""
    leads = (await session.execute(select(Lead).where(
        Lead.tenant_id == current_user.tenant_id,
        Lead.buyer_email == current_user.email,
    ))).scalars().all()
    reservations = (await session.execute(select(Reservation).where(
        Reservation.tenant_id == current_user.tenant_id,
        Reservation.buyer_email == current_user.email,
    ))).scalars().all()
    return {
        "account": {
            "id": str(current_user.id),
            "email": current_user.email,
            "full_name": current_user.full_name,
            "terms_accepted_at": current_user.terms_accepted_at,
            "terms_version": current_user.terms_version,
        },
        "leads": [
            {
                "id": str(item.id),
                "plot_id": str(item.plot_id),
                "buyer_name": item.buyer_name,
                "buyer_phone": item.buyer_phone,
                "buyer_email": item.buyer_email,
                "message": item.message,
                "status": item.status,
                "consent_at": item.consent_at,
                "consent_version": item.consent_version,
                "created_at": item.created_at,
                "expires_at": item.expires_at,
            }
            for item in leads
        ],
        "reservations": [
            {
                "id": str(item.id),
                "plot_id": str(item.plot_id),
                "buyer_name": item.buyer_name,
                "buyer_phone": item.buyer_phone,
                "buyer_email": item.buyer_email,
                "note": item.note,
                "status": item.status.value if hasattr(item.status, "value") else item.status,
                "created_at": item.created_at,
                "expires_at": item.expires_at,
            }
            for item in reservations
        ],
    }


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    response: Response,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Anonymize matching contact records and disable the account."""
    await session.execute(update(Lead).where(
        Lead.tenant_id == current_user.tenant_id,
        Lead.buyer_email == current_user.email,
    ).values(buyer_name=None, buyer_phone=None, buyer_email=None, message=None))
    await session.execute(update(Reservation).where(
        Reservation.tenant_id == current_user.tenant_id,
        Reservation.buyer_email == current_user.email,
    ).values(buyer_name=None, buyer_phone=None, buyer_email=None, note=None))
    current_user.email = f"deleted-{current_user.id}@invalid.landsearch"
    current_user.full_name = None
    current_user.password_hash = "deleted"
    current_user.is_active = False
    await session.commit()
    await logout(response)
