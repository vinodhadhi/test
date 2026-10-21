from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_db, require_csrf
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
