"""Public account-deletion flow (Google Play / Apple requirement).

Provides a public web page where anyone can request account deletion without
installing or logging into the app:
  POST /api/account-deletion/request   { email }
  POST /api/account-deletion/confirm   { token }
The HTML pages themselves are served from server.py at /account-deletion.
"""
import logging
import secrets
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from database import db
from utils.email_utils import send_email, APP_WEB_URL

logger = logging.getLogger(__name__)

router = APIRouter()

DELETION_TOKEN_TTL_HOURS = 24

# Simple in-memory throttle: max 3 requests per IP per 10 minutes.
_throttle: dict = defaultdict(deque)
_THROTTLE_MAX = 3
_THROTTLE_WINDOW_SECONDS = 600


class DeletionRequestPayload(BaseModel):
    email: str


class DeletionConfirmPayload(BaseModel):
    token: str


def _throttled(ip: str) -> bool:
    now = datetime.now(timezone.utc)
    q = _throttle[ip]
    while q and (now - q[0]).total_seconds() > _THROTTLE_WINDOW_SECONDS:
        q.popleft()
    if len(q) >= _THROTTLE_MAX:
        return True
    q.append(now)
    return False


def _new_deletion_token() -> str:
    return secrets.token_urlsafe(32)


async def _user_by_email(email: str) -> dict | None:
    return await db.users.find_one(
        {"email": email.strip().lower(), "is_deleted": {"$ne": True}},
        {"user_id": 1, "email": 1, "name": 1},
    )


async def _send_deletion_email(user: dict, token: str) -> None:
    link = f"{APP_WEB_URL}/account-deletion/confirm?token={token}"
    name = user.get("name") or "there"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#264348">
      <h2 style="margin:0 0 12px">Delete your Perix account</h2>
      <p>Hi {name},</p>
      <p>We received a request to delete your Perix account and all associated
      data. This is permanent and cannot be undone.</p>
      <p>If this was you, confirm the deletion here (link valid for
      {DELETION_TOKEN_TTL_HOURS} hours):</p>
      <p style="margin:24px 0">
        <a href="{link}" style="background:#59ABE3;color:#fff;padding:12px 24px;
        border-radius:8px;text-decoration:none;font-weight:bold">Delete my account</a>
      </p>
      <p style="color:#666;font-size:13px">
        If you didn't request this, you can safely ignore this email — your
        account will not be changed.</p>
    </div>
    """
    try:
        ok = await send_email(user["email"], "Delete your Perix account", html)
        if not ok:
            logger.warning(f"Deletion email not delivered for {user['user_id']}")
    except Exception as e:
        logger.warning(f"Deletion email error: {e}")


@router.post("/account-deletion/request")
async def request_account_deletion(payload: DeletionRequestPayload, request: Request):
    """Public: request an account-deletion link for the given email.

    Always returns success to avoid leaking which emails have accounts.
    """
    client_ip = request.client.host if request.client else "unknown"
    if _throttled(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        return {"success": True, "message": "If an account exists for this email, a deletion link has been sent."}

    user = await _user_by_email(email)
    if not user:
        return {"success": True, "message": "If an account exists for this email, a deletion link has been sent."}

    token = _new_deletion_token()
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "deletion_web_token": token,
            "deletion_web_token_expires": datetime.now(timezone.utc) + timedelta(hours=DELETION_TOKEN_TTL_HOURS),
        }},
    )
    await _send_deletion_email(user, token)
    return {"success": True, "message": "If an account exists for this email, a deletion link has been sent."}


async def resolve_deletion_token(token: str) -> dict | None:
    """Return the user for a valid, unexpired deletion token, or None."""
    if not token:
        return None
    user = await db.users.find_one(
        {"deletion_web_token": token, "is_deleted": {"$ne": True}},
        {"user_id": 1, "email": 1, "name": 1, "deletion_web_token_expires": 1},
    )
    if not user:
        return None
    expires = user.get("deletion_web_token_expires")
    if not expires or datetime.now(timezone.utc) > expires:
        return None
    return user


@router.post("/account-deletion/confirm")
async def confirm_account_deletion(payload: DeletionConfirmPayload, request: Request):
    """Public: permanently delete the account linked to a valid deletion token."""
    client_ip = request.client.host if request.client else "unknown"
    if _throttled(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    user = await resolve_deletion_token((payload.token or "").strip())
    if not user:
        raise HTTPException(status_code=404, detail="This deletion link is invalid or has expired. Please request a new one.")

    from services.entity_ownership import (
        run_account_deletion,
        acquire_new_deletion_lock,
        set_deletion_pending,
        get_account_deletion_state,
    )

    user_id = user["user_id"]
    state = await get_account_deletion_state(user_id)
    if state == "completed":
        return {"success": True, "message": "Account already deleted"}
    if state in ("failed", "review_required"):
        raise HTTPException(status_code=202, detail="Deletion requires administrative review")
    if state in ("running", "ready_to_resume"):
        raise HTTPException(status_code=409, detail="Account deletion is already in progress")
    if state != "new":
        raise HTTPException(status_code=500, detail="Unknown deletion state")

    lock_key = f"account_deletion:{user_id}"
    if not await acquire_new_deletion_lock(user_id):
        raise HTTPException(status_code=409, detail="Deletion is already in progress")
    await set_deletion_pending(user_id)

    result = await run_account_deletion(user_id, lock_key)
    if result["status"] == "completed":
        # Clear the web token
        await db.users.update_one(
            {"user_id": user_id},
            {"$unset": {"deletion_web_token": "", "deletion_web_token_expires": ""}},
        )
        return {"success": True, "message": "Your Perix account and associated data have been deleted."}
    if result["status"] == "review_required":
        raise HTTPException(status_code=202, detail="Deletion requires manual review. Our team will complete it.")
    raise HTTPException(status_code=500, detail="Deletion failed. Please try again or contact support@perix.app")


# ─── HTML pages (served from server.py) ───


def _page(title: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>{title}</title>
<style>
  body {{ font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif;
         background:#f7fafc; color:#264348; margin:0; padding:32px 16px; }}
  .card {{ max-width:480px; margin:0 auto; background:#fff; border-radius:16px;
          padding:28px; box-shadow:0 4px 16px rgba(0,0,0,0.08); }}
  h1 {{ font-size:22px; margin:0 0 8px; }}
  p {{ line-height:1.55; color:#4a5a60; }}
  label {{ display:block; font-weight:600; margin:16px 0 6px; }}
  input[type=email] {{ width:100%; padding:12px; border:1px solid #d7e2e8;
         border-radius:10px; font-size:15px; box-sizing:border-box; }}
  button {{ margin-top:18px; width:100%; padding:13px; border:0; border-radius:10px;
            background:#59ABE3; color:#fff; font-size:16px; font-weight:700; cursor:pointer; }}
  button:disabled {{ background:#a8cfe8; cursor:wait; }}
  .muted {{ font-size:13px; color:#8a9aa3; }}
  .msg {{ margin-top:14px; font-weight:600; }}
  .ok {{ color:#1a9c5e; }} .err {{ color:#d64545; }}
</style>
</head>
<body>
  <div class="card">
    <h1>{title}</h1>
    {body}
  </div>
</body>
</html>"""


def deletion_request_page_html() -> str:
    body = """
    <p>Use this page to request permanent deletion of your Perix account and
    all associated data — no app installation or login required.</p>
    <form id="f">
      <label for="email">Account email address</label>
      <input id="email" type="email" required placeholder="you@example.com"/>
      <button id="btn" type="submit">Send deletion link</button>
      <p id="msg" class="msg"></p>
      <p class="muted">We'll email you a confirmation link. It expires after 24 hours.</p>
    </form>
    <script>
      document.getElementById('f').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn');
        const msg = document.getElementById('msg');
        btn.disabled = true;
        msg.className = 'msg';
        msg.textContent = 'Sending…';
        try {
          const res = await fetch('/api/account-deletion/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: document.getElementById('email').value })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Request failed');
          msg.className = 'msg ok';
          msg.textContent = data.message || 'If an account exists for this email, a deletion link has been sent.';
        } catch (err) {
          msg.className = 'msg err';
          msg.textContent = err.message || 'Something went wrong. Please try again.';
        } finally {
          btn.disabled = false;
        }
      });
    </script>
    """
    return _page("Delete your Perix account", body)


def deletion_confirm_page_html(token: str, user: dict | None = None, error: str | None = None) -> str:
    if error:
        body = f"""
        <p class="msg err">{error}</p>
        <p>You can <a href="/account-deletion">request a new deletion link</a>.</p>
        """
        return _page("Delete your Perix account", body)

    name = (user or {}).get("name") or "your"
    import json
    body = """
    <p>You are about to <strong>permanently delete</strong> __NAME__ Perix account
    and all associated content (posts, photos, messages, events, listings and
    personal data). This cannot be undone.</p>
    <button id="btn" type="button">Permanently delete my account</button>
    <p id="msg" class="msg"></p>
    <p class="muted">Need help? Contact support@perix.app</p>
    <script>
      document.getElementById('btn').addEventListener('click', async () => {
        const btn = document.getElementById('btn');
        const msg = document.getElementById('msg');
        btn.disabled = true;
        msg.className = 'msg';
        msg.textContent = 'Deleting…';
        try {
          const res = await fetch('/api/account-deletion/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: __TOKEN_PLACEHOLDER__ })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Deletion failed');
          msg.className = 'msg ok';
          msg.textContent = data.message || 'Account deleted.';
          btn.style.display = 'none';
        } catch (err) {
          msg.className = 'msg err';
          msg.textContent = err.message || 'Something went wrong. Please try again.';
          btn.disabled = false;
        }
      });
    </script>
    """
    body = body.replace("__NAME__", name).replace("__TOKEN_PLACEHOLDER__", json.dumps(token))
    return _page("Delete your Perix account", body)
