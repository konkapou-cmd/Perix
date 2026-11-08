"""Web Push (PWA) support.

- Stores per-user browser Push subscriptions (VAPID).
- Computes the app icon badge count: unread messages + pending bookings.
- Sends background notifications while the app is closed via the service
  worker (public/sw.js), including the fresh badge count.
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import db
from routes.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

VAPID_PUBLIC_KEY = os.getenv(
    "VAPID_PUBLIC_KEY",
    "BHiFoYBuhNN-oEo_gXWwAt4RClJrNVZUIzGvb36Nf52iuaHAwI0c7QyrKGvdkxKhgXY7imBnjXma-nreQtf4ZvE",
)
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "g7NcpByGpPgX-fzvifB9C5iXCfGKeL9aIA0eODHcjpA")
VAPID_CLAIMS = {"sub": os.getenv("VAPID_SUBJECT", "mailto:support@perixapp.com")}


class WebPushSubscriptionPayload(BaseModel):
    subscription: dict


class WebPushUnsubscribePayload(BaseModel):
    endpoint: str


async def compute_web_badge(user_id: str) -> Dict[str, int]:
    """Badge = unread messages + pending bookings (as client and as business owner)."""
    unread_messages = await db.messages.count_documents(
        {"to_user_id": user_id, "read": False}
    )

    pending_bookings_client = await db.bookings.count_documents(
        {"client_id": user_id, "status": "pending"}
    )

    business_ids: List[str] = [
        b["business_id"]
        async for b in db.businesses.find({"owner_id": user_id}, {"business_id": 1})
    ]
    pending_bookings_owner = 0
    if business_ids:
        pending_bookings_owner = await db.bookings.count_documents(
            {"business_id": {"$in": business_ids}, "status": "pending"}
        )

    pending_bookings = pending_bookings_client + pending_bookings_owner
    return {
        "unread_messages": unread_messages,
        "pending_bookings": pending_bookings,
        "total": unread_messages + pending_bookings,
    }


@router.get("/push/badge")
async def get_web_badge(current_user=Depends(get_current_user)):
    return await compute_web_badge(current_user.user_id)


@router.post("/push/subscribe")
async def subscribe_web_push(
    payload: WebPushSubscriptionPayload,
    current_user=Depends(get_current_user),
):
    subscription = payload.subscription
    endpoint = subscription.get("endpoint") if isinstance(subscription, dict) else None
    if not endpoint:
        raise HTTPException(status_code=400, detail="Invalid subscription")

    await db.web_push_subscriptions.update_one(
        {"user_id": current_user.user_id, "endpoint": endpoint},
        {
            "$set": {
                "user_id": current_user.user_id,
                "endpoint": endpoint,
                "subscription": subscription,
                "updated_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )
    return {"success": True}


@router.post("/push/unsubscribe")
async def unsubscribe_web_push(
    payload: WebPushUnsubscribePayload,
    current_user=Depends(get_current_user),
):
    await db.web_push_subscriptions.delete_many(
        {"user_id": current_user.user_id, "endpoint": payload.endpoint}
    )
    return {"success": True}


def _send_webpush_sync(subscription: dict, payload: dict) -> bool:
    """Send a Web Push message (RFC 8291 aes128gcm + VAPID ES256 JWT).

    Implemented directly on httpx + cryptography to avoid heavyweight
    third-party dependencies in the production image.
    """
    import base64
    import hashlib
    import hmac as _hmac
    import time

    import httpx
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    def b64u_decode(s: str) -> bytes:
        return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

    def b64u_encode(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

    def _vapid_private_key():
        d = b64u_decode(VAPID_PRIVATE_KEY)
        pub = b64u_decode(VAPID_PUBLIC_KEY)  # 65-byte uncompressed point
        der = (
            b"\x30\x77\x02\x01\x01\x04\x20" + d
            + b"\xa0\x0a\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07"
            + b"\xa1\x44\x03\x42\x00" + pub
        )
        return serialization.load_der_private_key(der, password=None)

    def _vapid_jwt(aud: str) -> str:
        private_key = _vapid_private_key()
        header = {"typ": "JWT", "alg": "ES256"}
        claims = {
            "aud": aud,
            "exp": int(time.time()) + 12 * 3600,
            "sub": VAPID_CLAIMS.get("sub", "mailto:support@perixapp.com"),
        }

        def enc(obj: dict) -> str:
            return b64u_encode(json.dumps(obj, separators=(",", ":")).encode())

        signing_input = f"{enc(header)}.{enc(claims)}"
        der_sig = private_key.sign(signing_input.encode(), ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(der_sig)
        raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")
        return f"{signing_input}.{b64u_encode(raw_sig)}"

    def _expand(prk: bytes, info: bytes, length: int) -> bytes:
        out = b""
        t = b""
        i = 1
        while len(out) < length:
            t = _hmac.new(prk, t + info + bytes([i]), hashlib.sha256).digest()
            out += t
            i += 1
        return out[:length]

    def _encrypt(subscription: dict, plaintext: bytes) -> bytes:
        keys = subscription.get("keys", {}) or {}
        ua_pub = b64u_decode(keys.get("p256dh", ""))
        auth_secret = b64u_decode(keys.get("auth", ""))
        salt = os.urandom(16)
        local_private = ec.generate_private_key(ec.SECP256R1())
        local_pub_nums = local_private.public_key().public_numbers()
        local_pub_bytes = (
            b"\x04"
            + local_pub_nums.x.to_bytes(32, "big")
            + local_pub_nums.y.to_bytes(32, "big")
        )
        peer_pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_pub)
        shared = local_private.exchange(ec.ECDH(), peer_pub)
        prk = _hmac.new(auth_secret, shared, hashlib.sha256).digest()
        cek = _expand(prk, b"Content-Encoding: aes128gcm\x00", 16)
        nonce = _expand(prk, b"Content-Encoding: nonce\x00", 12)
        header = b"\x00\x00\x00\x00" + bytes([65]) + local_pub_bytes
        ciphertext = AESGCM(cek).encrypt(nonce, plaintext, header)
        return header + ciphertext

    endpoint = subscription.get("endpoint", "")
    if not endpoint:
        return True
    try:
        aud = endpoint.split("/")[2]
        jwt = _vapid_jwt(aud)
        body = _encrypt(subscription, json.dumps(payload).encode())
        headers = {
            "TTL": "86400",
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "Authorization": f"vapid t={jwt}, k={VAPID_PUBLIC_KEY}",
        }
        response = httpx.post(endpoint, content=body, headers=headers, timeout=15)
        if response.status_code in (404, 410):
            return False  # subscription gone — caller removes it
        if response.status_code >= 500:
            logger.warning(f"WebPush send failed ({response.status_code})")
        return True  # keep subscription for transient failures
    except Exception as e:
        logger.warning(f"WebPush send error: {e}")
        return True


async def notify_web_push(
    user_id: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
):
    """Send a background notification to all of a user's browser subscriptions.

    Best-effort: never raises into the caller. Dead subscriptions are removed.
    """
    if not user_id:
        return
    try:
        subscriptions = await db.web_push_subscriptions.find(
            {"user_id": user_id}
        ).to_list(20)
        if not subscriptions:
            return

        badge = await compute_web_badge(user_id)
        payload = {
            "title": title,
            "body": body,
            "badge": badge.get("total", 0),
            "data": data or {},
        }

        for sub_doc in subscriptions:
            endpoint = sub_doc.get("endpoint", "")
            subscription = sub_doc.get("subscription")
            if not subscription or not isinstance(subscription, dict):
                continue
            try:
                keep = await asyncio.to_thread(_send_webpush_sync, subscription, payload)
            except Exception:
                keep = True
            if not keep:
                await db.web_push_subscriptions.delete_many({"endpoint": endpoint})
    except Exception as e:
        logger.warning(f"notify_web_push failed: {e}")


async def notify_new_message_web_push(recipient_user_ids: List[str], sender_name: str, preview: str):
    for uid in recipient_user_ids:
        if not uid:
            continue
        asyncio.create_task(
            notify_web_push(
                uid,
                sender_name or "Perix",
                (preview or "New message")[:200],
                data={"type": "new_message"},
            )
        )


async def notify_booking_web_push(
    *,
    client_id: Optional[str],
    owner_user_id: Optional[str],
    service_name: str,
    client_name: Optional[str],
):
    tasks = []
    if owner_user_id:
        tasks.append(
            notify_web_push(
                owner_user_id,
                "New booking request",
                f"{client_name or 'A user'} requested {service_name}",
                data={"type": "booking"},
            )
        )
    if client_id:
        tasks.append(
            notify_web_push(
                client_id,
                "Booking received",
                f"Your request for {service_name} is pending confirmation",
                data={"type": "booking"},
            )
        )
    if tasks:
        asyncio.create_task(asyncio.gather(*tasks))
