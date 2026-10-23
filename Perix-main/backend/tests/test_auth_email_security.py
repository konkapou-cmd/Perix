"""Auth email regressions with normal imports and no database operations."""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException, Response, Request

from routes import auth
from services import entity_ownership
from utils import email_utils


@pytest.fixture(autouse=True)
def isolated_auth(monkeypatch):
    db = SimpleNamespace(
        users=SimpleNamespace(
            find_one=AsyncMock(return_value=None),
            insert_one=AsyncMock(),
            update_one=AsyncMock(),
        ),
        password_reset_tokens=SimpleNamespace(
            find_one=AsyncMock(return_value=None),
            insert_one=AsyncMock(),
            update_one=AsyncMock(return_value=SimpleNamespace(modified_count=1)),
        ),
        user_sessions=SimpleNamespace(delete_one=AsyncMock(), delete_many=AsyncMock()),
    )
    monkeypatch.setattr(auth, "db", db)
    monkeypatch.setattr(entity_ownership, "can_receive_email", Mock(return_value=True))
    monkeypatch.setattr(email_utils, "send_password_reset_email", AsyncMock(return_value=True))
    monkeypatch.setattr(email_utils, "send_verification_email", AsyncMock(return_value=True))
    monkeypatch.setattr(auth, "pwd_context", Mock(hash=Mock(return_value="test-password-hash")))
    return db


@pytest.mark.parametrize("branch", ["unknown", "ineligible", "unverified", "success", "failed", "unconfigured"])
async def test_forgot_password_is_generic_and_only_eligible_users_get_tokens(monkeypatch, isolated_auth, branch):
    db = isolated_auth
    user = {"user_id": "user-test", "email": "reader@example.com", "email_verified": True}
    db.users.find_one.return_value = None if branch == "unknown" else user
    entity_ownership.can_receive_email.return_value = branch != "ineligible"
    if branch == "unverified":
        user["email_verified"] = False
    email_utils.send_password_reset_email.return_value = branch not in ("failed", "unconfigured")
    monkeypatch.setattr(email_utils, "email_configured", Mock(return_value=branch != "unconfigured"))
    token = Mock(return_value="private-reset-token")
    monkeypatch.setattr(auth.secrets, "token_urlsafe", token)

    result = await auth.forgot_password(auth.ForgotPasswordInput(email="  Reader@Example.com  "))

    assert result == {
        "status": "reset_email_sent",
        "message": "If the email exists, a reset link has been sent.",
    }
    assert "private-reset-token" not in str(result)
    db.users.find_one.assert_awaited_once_with({"email": "reader@example.com"})
    if branch == "unknown":
        entity_ownership.can_receive_email.assert_not_called()
    else:
        entity_ownership.can_receive_email.assert_called_once_with(user)
    if branch in ("unknown", "ineligible"):
        token.assert_not_called()
        db.password_reset_tokens.insert_one.assert_not_awaited()
        email_utils.send_password_reset_email.assert_not_awaited()
    else:
        token.assert_called_once_with(32)
        db.password_reset_tokens.insert_one.assert_awaited_once()
        stored = db.password_reset_tokens.insert_one.await_args.args[0]
        assert stored == {
            "token": "private-reset-token",
            "email": "reader@example.com",
            "created_at": stored["created_at"],
            "expires_at": stored["created_at"] + timedelta(hours=1),
            "used": False,
        }
        assert isinstance(stored["created_at"], datetime)
        email_utils.send_password_reset_email.assert_awaited_once_with("reader@example.com", stored["token"])
    db.users.update_one.assert_not_awaited()


async def test_registration_schedules_verification_email(monkeypatch, isolated_auth):
    db = isolated_auth
    public = auth.UserPublic(
        user_id="user-test",
        email="reader@example.com",
        name="Reader",
        created_at=datetime(2026, 1, 1),
        email_verified=False,
    )
    monkeypatch.setattr(auth, "generate_id", Mock(return_value=public.user_id))
    monkeypatch.setattr(auth, "create_session", AsyncMock(return_value="test-session"))
    monkeypatch.setattr(auth, "build_user_public", Mock(return_value=public))
    assert callable(auth.asyncio.create_task)
    # Run the real scheduler, then await the captured task so no work escapes the test.
    tasks = []
    create_task = asyncio.create_task

    def capture_task(coroutine):
        task = create_task(coroutine)
        tasks.append(task)
        return task

    schedule = Mock(side_effect=capture_task)
    monkeypatch.setattr(auth.asyncio, "create_task", schedule)
    payload = auth.RegisterInput(
        name="Reader",
        email="reader@example.com",
        password="test-password",
        accepted_terms=True,
        age_confirmed=True,
    )

    result = await auth.register_user(payload, Response())

    schedule.assert_called_once()
    await tasks[0]
    db.users.insert_one.assert_awaited_once()
    stored = db.users.insert_one.await_args.args[0]
    assert stored["email_verified"] is False
    assert stored["email_verification_token"]
    email_utils.send_verification_email.assert_awaited_once_with(payload.email, stored["email_verification_token"])
    auth.create_session.assert_awaited_once_with(public.user_id)
    auth.build_user_public.assert_called_once_with(stored)
    assert result.user == public
    assert result.session_token == "test-session"
    assert stored["email_verification_token"] not in result.model_dump_json()


@pytest.mark.parametrize("invalid", ["expired", "used"])
async def test_reset_rejects_expired_or_used_tokens(monkeypatch, isolated_auth, invalid):
    db = isolated_auth
    now = datetime(2026, 1, 1)
    clock = Mock(wraps=datetime)
    clock.utcnow.return_value = now
    monkeypatch.setattr(auth, "datetime", clock)
    stored = {
        "token": "test-reset-token",
        "email": "reader@example.com",
        "used": invalid == "used",
        "expires_at": now - timedelta(seconds=1) if invalid == "expired" else now + timedelta(hours=1),
    }

    async def find_token(query):
        assert query == {"token": stored["token"], "used": False, "expires_at": {"$gt": now}}
        if stored["used"] == query["used"] and stored["expires_at"] > query["expires_at"]["$gt"]:
            return stored
        return None

    db.password_reset_tokens.find_one.side_effect = find_token
    with pytest.raises(HTTPException) as error:
        await auth.reset_password(auth.ResetPasswordInput(token=stored["token"], new_password="new-password"))

    assert error.value.status_code == 400
    assert error.value.detail == "Invalid or expired token"
    db.password_reset_tokens.find_one.assert_awaited_once()
    db.password_reset_tokens.update_one.assert_not_awaited()
    db.users.find_one.assert_not_awaited()
    db.users.update_one.assert_not_awaited()
    auth.pwd_context.hash.assert_not_called()


@pytest.mark.parametrize("modified_count", [0, 1])
async def test_reset_requires_atomic_one_use_token_consumption(isolated_auth, modified_count):
    db = isolated_auth
    db.password_reset_tokens.find_one.return_value = {"email": "reader@example.com"}
    db.users.find_one.return_value = {"user_id": "reader", "email": "reader@example.com"}
    db.password_reset_tokens.update_one.return_value.modified_count = modified_count
    payload = auth.ResetPasswordInput(token="test-reset-token", new_password="new-password")

    if modified_count:
        assert await auth.reset_password(payload) == {"status": "password_reset", "email": "reader@example.com"}
        db.users.update_one.assert_awaited_once_with(
            {"email": "reader@example.com"}, {"$set": {"password_hash": "test-password-hash"}}
        )
        auth.pwd_context.hash.assert_called_once_with("new-password")
        db.user_sessions.delete_many.assert_awaited_once_with({"user_id": "reader"})
    else:
        with pytest.raises(HTTPException) as error:
            await auth.reset_password(payload)
        assert error.value.status_code == 400
        assert error.value.detail == "Token already used"
        db.users.update_one.assert_not_awaited()
        auth.pwd_context.hash.assert_not_called()
        db.user_sessions.delete_many.assert_not_awaited()
    consume, update = db.password_reset_tokens.update_one.await_args.args
    assert consume["token"] == "test-reset-token" and consume["used"] is False
    assert isinstance(consume["expires_at"]["$gt"], datetime)
    assert update == {"$set": {"used": True}}
    entity_ownership.can_receive_email.assert_called_once_with(db.users.find_one.return_value)


async def test_logout_revokes_cookie_and_bearer_and_expires_cookie(isolated_auth):
    request = Request({"type": "http", "headers": [
        (b"cookie", b"session_token=cookie-session"),
        (b"authorization", b"Bearer bearer-session"),
    ]})
    response = Response()
    assert await auth.logout_user(request, response) == {"status": "logged_out"}
    deleted = {call.args[0]["session_token"] for call in isolated_auth.user_sessions.delete_one.await_args_list}
    assert deleted == {"cookie-session", "bearer-session"}
    cookie = response.headers["set-cookie"]
    assert "Max-Age=0" in cookie and "Path=/" in cookie and "Secure" in cookie


async def test_token_expiring_between_read_and_consume_cannot_change_password(isolated_auth):
    isolated_auth.password_reset_tokens.find_one.return_value = {"email": "reader@example.com"}
    isolated_auth.users.find_one.return_value = {"user_id": "reader", "email": "reader@example.com"}
    isolated_auth.password_reset_tokens.update_one.return_value.modified_count = 0
    with pytest.raises(HTTPException):
        await auth.reset_password(auth.ResetPasswordInput(token="expired-in-flight", new_password="new-password"))
    assert "expires_at" in isolated_auth.password_reset_tokens.update_one.await_args.args[0]
    isolated_auth.users.update_one.assert_not_awaited()
    isolated_auth.user_sessions.delete_many.assert_not_awaited()
