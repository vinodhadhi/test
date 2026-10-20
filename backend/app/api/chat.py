"""Live bug discussion events. Comments remain persisted by the REST API."""

import asyncio
from collections import defaultdict
from datetime import UTC, datetime
from urllib.parse import urlparse

import jwt
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import decode_token
from app.models.bug import Bug
from app.models.user import User, UserRole
from app.services.bug_access import require_bug_access

router = APIRouter()


class ChatHub:
    def __init__(self) -> None:
        self.rooms: dict[int, set[WebSocket]] = defaultdict(set)
        self.loop: asyncio.AbstractEventLoop | None = None

    async def broadcast(self, bug_id: int, event: dict, exclude: WebSocket | None = None) -> None:
        for peer in tuple(self.rooms.get(bug_id, ())):
            if peer is exclude:
                continue
            try:
                await peer.send_json(event)
            except (RuntimeError, WebSocketDisconnect, OSError):
                self.rooms[bug_id].discard(peer)

    def publish_from_rest(self, bug_id: int, event: dict) -> None:
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast(bug_id, event), self.loop)


hub = ChatHub()


def _origin_allowed(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    if not origin:
        return False
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    if settings.app_env.lower() == "production":
        return origin.rstrip("/") == settings.frontend_origin.rstrip("/")
    # Development clients may use a LAN address and Vite's proxy, but the
    # browser origin must still be on the same host as the socket endpoint.
    return parsed.hostname == websocket.url.hostname or origin.rstrip("/") == settings.frontend_origin.rstrip("/")


def _authorize(bug_id: int, token: str | None) -> tuple[int, str, UserRole, int] | None:
    if not token:
        return None
    try:
        claims = decode_token(token, expected_type="access")
        user_id = int(claims["sub"])
        with SessionLocal() as db:
            user = db.scalar(select(User).where(User.id == user_id))
            bug = db.scalar(select(Bug).where(Bug.id == bug_id))
            if user is None or not user.is_active or bug is None:
                return None
            require_bug_access(db, user, bug)
            return user.id, user.full_name, user.role, int(claims["exp"])
    except (ValueError, TypeError, jwt.PyJWTError, HTTPException):
        return None


@router.websocket("/ws/bugs/{bug_id}/chat")
async def bug_chat(websocket: WebSocket, bug_id: int) -> None:
    if bug_id < 1 or not _origin_allowed(websocket):
        await websocket.close(code=1008)
        return
    actor = await asyncio.to_thread(_authorize, bug_id, websocket.cookies.get("access_token"))
    if actor is None:
        await websocket.close(code=1008)
        return
    user_id, user_name, role, expires_at = actor
    await websocket.accept()
    hub.loop = asyncio.get_running_loop()
    hub.rooms[bug_id].add(websocket)
    try:
        while True:
            remaining = expires_at - datetime.now(UTC).timestamp()
            if remaining <= 0:
                await websocket.close(code=1008)
                break
            try:
                event = await asyncio.wait_for(websocket.receive_json(), timeout=remaining)
            except TimeoutError:
                await websocket.close(code=1008)
                break
            if not isinstance(event, dict) or event.get("type") != "typing" or type(event.get("is_typing")) is not bool:
                await websocket.close(code=1003)
                break
            if role == UserRole.MANAGER:
                continue
            await hub.broadcast(bug_id, {"type": "typing", "user_id": user_id, "user_name": user_name, "is_typing": event["is_typing"]}, exclude=websocket)
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        hub.rooms[bug_id].discard(websocket)
        if not hub.rooms[bug_id]:
            hub.rooms.pop(bug_id, None)
        await hub.broadcast(bug_id, {"type": "typing", "user_id": user_id, "user_name": user_name, "is_typing": False})
