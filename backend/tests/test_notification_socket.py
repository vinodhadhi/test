import asyncio
import json
from datetime import timedelta
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import notifications
from app.core.database import Base
from app.core.security import create_token
from app.models.notification import Notification
from app.models.user import User, UserRole


def test_socket_snapshot_is_private_and_rejects_revoked_sessions():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine)
    try:
        with sessions.begin() as db:
            for user_id in (1, 2):
                db.add(User(id=user_id, user_id=str(user_id), full_name="Test", role=UserRole.TESTER, password_hash="unused"))
            db.flush()
            for user_id in (1, 2):
                db.add(Notification(user_id=user_id, kind="test", title=str(user_id), message="Private", link="/bugs"))
        token = create_token(subject="1", token_type="access", expires_delta=timedelta(minutes=1))
        with patch.object(notifications, "SessionLocal", sessions):
            snapshot = json.loads(notifications._socket_snapshot(token))
            assert snapshot["unread_count"] == 1
            assert [item["title"] for item in snapshot["items"]] == ["1"]
            assert notifications._socket_snapshot(None) is None
            assert notifications._socket_snapshot("invalid") is None
            with sessions.begin() as db:
                db.get(User, 1).auth_version += 1
            assert notifications._socket_snapshot(token) is None
    finally:
        engine.dispose()


def test_socket_rejects_origin_and_closes_on_session_revocation():
    async def run():
        socket = AsyncMock()
        socket.cookies = {"access_token": "token"}
        with patch.object(notifications, "_origin_allowed", return_value=False):
            await notifications.notification_socket(socket)
        socket.accept.assert_not_called()
        socket.close.assert_awaited_with(code=1008)
        socket.reset_mock()

        async def timeout(awaitable, timeout):
            awaitable.close()
            raise TimeoutError

        with patch.object(notifications, "_origin_allowed", return_value=True), patch.object(
            notifications, "_socket_snapshot", side_effect=['{"unread_count":1}', '{"unread_count":1}', None]
        ), patch.object(notifications.asyncio, "wait_for", side_effect=timeout):
            await notifications.notification_socket(socket)
        socket.accept.assert_awaited_once()
        assert [call.args[0]["type"] for call in socket.send_json.await_args_list] == ["notifications_changed", "heartbeat"]
        socket.close.assert_awaited_with(code=1008)

    asyncio.run(run())
