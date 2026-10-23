import asyncio
from datetime import UTC, datetime

import jwt
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import current_user, get_db, require_csrf
from app.api.chat import _origin_allowed
from app.core.database import SessionLocal
from app.core.security import decode_token
from app.models.notification import Notification
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    title: str
    message: str
    link: str
    created_at: datetime
    read_at: datetime | None


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    unread_count: int


def _socket_snapshot(token: str | None) -> str | None:
    if not token:
        return None
    try:
        claims = decode_token(token, expected_type="access")
        with SessionLocal() as db:
            actor = db.get(User, int(claims["sub"]))
            if actor is None or not actor.is_active or actor.auth_version != claims.get("auth_version"):
                return None
            return list_notifications(actor, db).model_dump_json()
    except (ValueError, TypeError, KeyError, jwt.PyJWTError):
        return None


@router.websocket("/ws")
async def notification_socket(websocket: WebSocket) -> None:
    if not _origin_allowed(websocket):
        await websocket.close(code=1008)
        return
    accepted = False
    previous = None
    try:
        while True:
            # Short-lived sessions observe committed changes from every API worker
            # and scheduled job, and recheck account/session validity each time.
            snapshot = await asyncio.to_thread(_socket_snapshot, websocket.cookies.get("access_token"))
            if snapshot is None:
                await websocket.close(code=1008)
                return
            if not accepted:
                await websocket.accept()
                accepted = True
            await websocket.send_json({"type": "notifications_changed" if snapshot != previous else "heartbeat"})
            previous = snapshot
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=5)
                # This stream is server-to-client only; mutations use CSRF-protected REST.
                await websocket.close(code=1003)
                return
            except TimeoutError:
                pass
    except WebSocketDisconnect:
        pass
    except (SQLAlchemyError, OSError):
        if accepted:
            await websocket.close(code=1011)


@router.get("", response_model=NotificationPage)
def list_notifications(actor: User = Depends(current_user), db: Session = Depends(get_db)) -> NotificationPage:
    items = list(db.scalars(select(Notification).where(Notification.user_id == actor.id).order_by(Notification.created_at.desc(), Notification.id.desc()).limit(50)))
    unread_count = db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == actor.id, Notification.read_at.is_(None))) or 0
    return NotificationPage(items=[NotificationOut.model_validate(item) for item in items], unread_count=unread_count)


@router.post("/read-all", dependencies=[Depends(require_csrf)])
def mark_all_read(actor: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, int]:
    result = db.execute(update(Notification).where(Notification.user_id == actor.id, Notification.read_at.is_(None)).values(read_at=datetime.now(UTC)))
    db.commit()
    return {"updated": result.rowcount or 0}


@router.post("/{notification_id}/read", response_model=NotificationOut, dependencies=[Depends(require_csrf)])
def mark_read(notification_id: int, actor: User = Depends(current_user), db: Session = Depends(get_db)) -> NotificationOut:
    item = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == actor.id))
    if item is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    if item.read_at is None:
        item.read_at = datetime.now(UTC)
        db.commit()
    return NotificationOut.model_validate(item)
