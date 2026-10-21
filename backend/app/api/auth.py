import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import current_user, require_csrf
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_token, decode_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, UserRead

router = APIRouter(prefix="/auth", tags=["Authentication"])
limiter = Limiter(key_func=get_remote_address)
ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
CSRF_COOKIE = "csrf_token"


def _set_auth_cookies(response: Response, user: User) -> None:
    response.set_cookie(ACCESS_COOKIE, create_token(subject=str(user.id), token_type="access", expires_delta=timedelta(minutes=settings.access_token_minutes), auth_version=user.auth_version), max_age=settings.access_token_minutes * 60, httponly=True, secure=settings.cookie_secure, samesite="lax", path="/")
    response.set_cookie(REFRESH_COOKIE, create_token(subject=str(user.id), token_type="refresh", expires_delta=timedelta(days=settings.refresh_token_days), auth_version=user.auth_version), max_age=settings.refresh_token_days * 86400, httponly=True, secure=settings.cookie_secure, samesite="lax", path="/auth")
    response.set_cookie(CSRF_COOKIE, secrets.token_urlsafe(32), max_age=settings.refresh_token_days * 86400, httponly=False, secure=settings.cookie_secure, samesite="lax", path="/")


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/auth")
    response.delete_cookie(CSRF_COOKIE, path="/")


@router.post("/login", response_model=UserRead)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> User:
    now = datetime.now(UTC)
    user = db.scalar(select(User).where(User.user_id == payload.user_id))
    # Use a fixed valid Argon2 hash for unknown IDs to reduce account enumeration by timing.
    if user is None:
        verify_password(payload.password, _DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Invalid user ID or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid user ID or password")
    locked_until = user.locked_until
    if locked_until and locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=UTC)
    if locked_until and locked_until > now:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
    if not verify_password(payload.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.login_max_failures:
            user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
            user.failed_login_attempts = 0
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid user ID or password")
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    _set_auth_cookies(response, user)
    return user


@router.post("/refresh", response_model=UserRead, dependencies=[Depends(require_csrf)])
def refresh(
    response: Response,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
    db: Session = Depends(get_db),
) -> User:
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = decode_token(refresh_token, expected_type="refresh")
        user = db.scalar(select(User).where(User.id == int(payload["sub"])))
    except (ValueError, TypeError, jwt.PyJWTError) as exc:
        raise HTTPException(status_code=401, detail="Authentication required") from exc
    if not user or not user.is_active or payload.get("auth_version") != user.auth_version:
        raise HTTPException(status_code=401, detail="Authentication required")
    _set_auth_cookies(response, user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
def logout(response: Response) -> Response:
    _clear_auth_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(current_user)) -> User:
    return user


# A one-time dummy hash is generated at process startup, never persisted.
_DUMMY_HASH = hash_password("not-a-real-password-value")
