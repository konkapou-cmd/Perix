"""WebSocket routes and connection manager."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Dict, Set, Optional, Any
import json
import logging

from database import db
from routes.dependencies import get_user_by_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, WebSocket] = {}
        self.channels: Dict[str, Set[str]] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active[user_id] = ws

    def disconnect(self, user_id: str):
        self.active.pop(user_id, None)
        for members in self.channels.values():
            members.discard(user_id)

    async def send_to_user(self, user_id: str, data: dict):
        ws = self.active.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id)

    async def broadcast_to_channel(self, channel: str, data: dict, exclude_user_id: Optional[str] = None):
        members = self.channels.get(channel, set())
        for uid in list(members):
            if uid != exclude_user_id:
                await self.send_to_user(uid, data)

    def subscribe(self, user_id: str, channel: str):
        if channel not in self.channels:
            self.channels[channel] = set()
        self.channels[channel].add(user_id)

    def unsubscribe(self, user_id: str, channel: str):
        if channel in self.channels:
            self.channels[channel].discard(user_id)


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: Optional[str] = Query(None)):
    if not token:
        await ws.close(code=4001, reason="Missing token")
        return

    try:
        user = await get_user_by_token(token)
        if not user:
            await ws.close(code=4001, reason="Invalid token")
            return
        user_id = user["user_id"]
    except Exception:
        await ws.close(code=4001, reason="Auth failed")
        return

    await manager.connect(user_id, ws)
    logger.info(f"WS connected: {user_id}")

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "subscribe":
                channel = msg.get("channel", "")
                if channel:
                    manager.subscribe(user_id, channel)

            elif msg_type == "unsubscribe":
                channel = msg.get("channel", "")
                if channel:
                    manager.unsubscribe(user_id, channel)

            elif msg_type == "ping":
                await manager.send_to_user(user_id, {"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(user_id)
        logger.info(f"WS disconnected: {user_id}")


async def ws_broadcast_new_message(recipient_user_id: str, message_data: dict):
    await manager.send_to_user(recipient_user_id, {
        "type": "new_message",
        "message": message_data,
    })


async def ws_broadcast_typing(recipient_user_id: str, from_user_id: str, is_typing: bool):
    await manager.send_to_user(recipient_user_id, {
        "type": "typing_indicator",
        "from_user_id": from_user_id,
        "is_typing": is_typing,
    })


async def ws_broadcast_conversation_update(user_id: str, conversation_data: dict):
    await manager.send_to_user(user_id, {
        "type": "conversation_update",
        "conversation": conversation_data,
    })


async def ws_broadcast_unread_count(user_id: str, count: int):
    await manager.send_to_user(user_id, {
        "type": "unread_count",
        "count": count,
    })


async def ws_broadcast_notification(user_id: str, notification: dict):
    await manager.send_to_user(user_id, {
        "type": "notification",
        "notification": notification,
    })


async def ws_broadcast_call_status(user_id: str, call_data: dict):
    await manager.send_to_user(user_id, {
        "type": "call_status",
        "call": call_data,
    })


async def ws_broadcast_channel_message(channel: str, message_data: dict, exclude_user_id: Optional[str] = None):
    await manager.broadcast_to_channel(channel, {
        "type": "channel_message",
        "channel": channel,
        "message": message_data,
    }, exclude_user_id=exclude_user_id)
