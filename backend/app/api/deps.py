import hmac
from typing import Annotated

import jwt
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User, UserRole


def current_user(access_token: Annotated[str | None, Cookie()] = None, db: Session = Depends(get_db)) -> User:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if not access_token:
        raise unauthorized
    try:
        payload = decode_token(access_token, expected_type="access")
        user = db.scalar(select(User).where(User.id == int(payload["sub"])))
    except (ValueError, TypeError, jwt.PyJWTError) as exc:
        raise unauthorized from exc
    if user is None or not user.is_active:
        raise unauthorized
    return user


def require_csrf(
    request: Request,
    csrf_cookie: Annotated[str | None, Cookie(alias="csrf_token")] = None,
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    if not csrf_cookie or not csrf_header or not hmac.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(status_code=403, detail="CSRF validation failed")


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user
