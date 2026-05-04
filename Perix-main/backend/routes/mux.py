"""Mux video upload routes."""
import logging
import hashlib
import hmac
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel
from typing import Optional

from config import MUX_TOKEN_ID, MUX_TOKEN_SECRET
from database import db
from routes.dependencies import get_current_user, UserPublic
from utils.helpers import generate_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mux", tags=["Mux Video"])


def _unwrap(response):
    """Unwrap mux_python v5+ response objects.

    In mux_python >= 5.0, API responses wrap data in a .data attribute.
    In older versions, attributes are directly on the response object.
    This helper normalizes access for both versions.
    """
    if hasattr(response, "data") and response.data is not None:
        return response.data
    return response


class MuxUploadCreateRequest(BaseModel):
    content_type: Optional[str] = None
    content_ref: Optional[str] = None


class MuxUploadCreateResponse(BaseModel):
    upload_id: str
    upload_url: str


class MuxUploadConfirmRequest(BaseModel):
    upload_id: str


class MuxAssetStatusResponse(BaseModel):
    asset_id: Optional[str] = None
    playback_id: Optional[str] = None
    playback_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    status: str
    duration: Optional[float] = None


def _get_mux_uploads_api():
    import mux_python
    configuration = mux_python.Configuration()
    configuration.username = MUX_TOKEN_ID
    configuration.password = MUX_TOKEN_SECRET
    return mux_python.DirectUploadsApi(mux_python.ApiClient(configuration))


def _get_mux_assets_api():
    import mux_python
    configuration = mux_python.Configuration()
    configuration.username = MUX_TOKEN_ID
    configuration.password = MUX_TOKEN_SECRET
    return mux_python.AssetsApi(mux_python.ApiClient(configuration))


@router.post("/upload/create", response_model=MuxUploadCreateResponse)
async def create_mux_upload(
    payload: MuxUploadCreateRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    if not MUX_TOKEN_ID or not MUX_TOKEN_SECRET:
        raise HTTPException(status_code=500, detail="Mux credentials not configured")

    try:
        import mux_python

        uploads_api = _get_mux_uploads_api()

        passthrough = f"{current_user.user_id}:{payload.content_ref or ''}"

        create_asset_request = mux_python.CreateAssetRequest(
            playback_policy=[mux_python.PlaybackPolicy.PUBLIC],
            video_quality="basic",
            passthrough=passthrough,
        )
        create_upload_request = mux_python.CreateUploadRequest(
            timeout=3600,
            new_asset_settings=create_asset_request,
            cors_origin="*",
        )
        response = uploads_api.create_direct_upload(create_upload_request)
        upload = _unwrap(response)

        await db.mux_uploads.insert_one({
            "upload_id": upload.id,
            "user_id": current_user.user_id,
            "content_ref": payload.content_ref,
            "passthrough": passthrough,
            "status": "created",
            "created_at": upload.created_at,
        })

        return MuxUploadCreateResponse(
            upload_id=upload.id,
            upload_url=upload.url,
        )
    except Exception as e:
        logger.error(f"create_mux_upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create Mux upload: {str(e)}")


@router.post("/upload/confirm")
async def confirm_mux_upload(
    payload: MuxUploadConfirmRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    try:
        import mux_python

        uploads_api = _get_mux_uploads_api()
        upload_info = _unwrap(uploads_api.get_direct_upload(payload.upload_id))

        if upload_info.asset_id:
            assets_api = _get_mux_assets_api()
            asset = _unwrap(assets_api.get_asset(upload_info.asset_id))

            playback_id = None
            if asset.playback_ids:
                playback_id = asset.playback_ids[0].id

            playback_url = f"https://stream.mux.com/{playback_id}.m3u8" if playback_id else None
            thumbnail_url = f"https://image.mux.com/{playback_id}/thumbnail.jpg?time=0" if playback_id else None

            await db.mux_uploads.update_one(
                {"upload_id": payload.upload_id},
                {"$set": {
                    "asset_id": asset.id,
                    "playback_id": playback_id,
                    "status": asset.status,
                }},
            )

            return {
                "upload_id": payload.upload_id,
                "asset_id": asset.id,
                "playback_id": playback_id,
                "playback_url": playback_url,
                "thumbnail_url": thumbnail_url,
                "status": asset.status,
                "duration": asset.duration,
            }
        else:
            await db.mux_uploads.update_one(
                {"upload_id": payload.upload_id},
                {"$set": {"status": "asset_pending"}},
            )
            return {
                "upload_id": payload.upload_id,
                "asset_id": None,
                "status": "processing",
            }
    except Exception as e:
        logger.error(f"confirm_mux_upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to confirm upload: {str(e)}")


@router.get("/asset/{asset_id}", response_model=MuxAssetStatusResponse)
async def get_mux_asset_status(
    asset_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    try:
        import mux_python

        assets_api = _get_mux_assets_api()
        asset = _unwrap(assets_api.get_asset(asset_id))

        playback_id = None
        if asset.playback_ids:
            playback_id = asset.playback_ids[0].id

        playback_url = f"https://stream.mux.com/{playback_id}.m3u8" if playback_id else None
        thumbnail_url = f"https://image.mux.com/{playback_id}/thumbnail.jpg?time=0" if playback_id else None

        return MuxAssetStatusResponse(
            asset_id=asset.id,
            playback_id=playback_id,
            playback_url=playback_url,
            thumbnail_url=thumbnail_url,
            status=asset.status,
            duration=asset.duration,
        )
    except Exception as e:
        logger.error(f"get_mux_asset_status failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get asset status: {str(e)}")


@router.post("/webhook")
async def mux_webhook(request: Request):
    body = await request.body()

    mux_signature = request.headers.get("Mux-Signature", "")
    if MUX_TOKEN_SECRET and mux_signature:
        try:
            _verify_mux_signature(body, mux_signature, MUX_TOKEN_SECRET)
        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid Mux signature")

    payload = await request.json()
    event_type = payload.get("type", "")
    event_data = payload.get("data", {})

    logger.info(f"[Mux Webhook] {event_type}")

    if event_type == "video.asset.ready":
        asset_id = event_data.get("id")
        playback_ids = event_data.get("playback_ids", [])
        passthrough = event_data.get("passthrough", "")
        duration = event_data.get("duration")

        playback_id = playback_ids[0]["id"] if playback_ids else None
        playback_url = f"https://stream.mux.com/{playback_id}.m3u8" if playback_id else None
        thumbnail_url = f"https://image.mux.com/{playback_id}/thumbnail.jpg?time=0" if playback_id else None

        await db.mux_uploads.update_one(
            {"asset_id": asset_id},
            {"$set": {
                "playback_id": playback_id,
                "status": "ready",
            }},
        )

        if passthrough and ":" in passthrough:
            user_id, content_ref = passthrough.split(":", 1)
            await _update_content_video_url(
                content_ref=content_ref,
                playback_url=playback_url,
                thumbnail_url=thumbnail_url,
                mux_asset_id=asset_id,
                mux_playback_id=playback_id,
                duration=duration,
            )

        try:
            from routes.ws import ws_broadcast_notification
            if playback_id:
                await ws_broadcast_notification(
                    db,
                    event="video_ready",
                    data={
                        "asset_id": asset_id,
                        "playback_id": playback_id,
                        "playback_url": playback_url,
                        "thumbnail_url": thumbnail_url,
                        "content_ref": passthrough.split(":", 1)[1] if ":" in passthrough else "",
                    },
                    exclude_user_id=None,
                )
        except Exception:
            pass

    elif event_type == "video.asset.errored":
        asset_id = event_data.get("id")
        logger.error(f"[Mux Webhook] Asset errored: {asset_id}")
        await db.mux_uploads.update_one(
            {"asset_id": asset_id},
            {"$set": {"status": "errored"}},
        )

    return {"received": True}


def _verify_mux_signature(body: bytes, signature_header: str, secret: str):
    parts = signature_header.split(",")
    t = None
    v1 = None
    for part in parts:
        key, val = part.split("=", 1)
        if key == "t":
            t = val
        elif key == "v1":
            v1 = val
    if not t or not v1:
        raise ValueError("Missing signature parts")

    payload = f"{t}.{body.decode()}"
    expected = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, v1):
        raise ValueError("Signature mismatch")


async def _update_content_video_url(
    content_ref: str,
    playback_url: str,
    thumbnail_url: str,
    mux_asset_id: str,
    mux_playback_id: str,
    duration: float = None,
):
    if content_ref.startswith("post:"):
        post_id = content_ref[5:]
        update = {
            "video_url": playback_url,
            "video_status": "ready",
            "mux_asset_id": mux_asset_id,
            "mux_playback_id": mux_playback_id,
            "mux_thumbnail_url": thumbnail_url,
        }
        if duration:
            update["video_duration"] = duration
        await db.posts.update_one({"post_id": post_id}, {"$set": update})
        logger.info(f"[Mux] Updated post {post_id} with playback URL")

    elif content_ref.startswith("story:"):
        story_id = content_ref[6:]
        update = {
            "media_url": playback_url,
            "video_status": "ready",
            "mux_asset_id": mux_asset_id,
            "mux_playback_id": mux_playback_id,
            "mux_thumbnail_url": thumbnail_url,
        }
        await db.stories.update_one({"story_id": story_id}, {"$set": update})
        logger.info(f"[Mux] Updated story {story_id} with playback URL")

    elif content_ref.startswith("gallery:user:"):
        user_id = content_ref[14:]
        await db.users.update_one(
            {"user_id": user_id},
            {"$addToSet": {"gallery_videos": playback_url}},
        )
        logger.info(f"[Mux] Added gallery video for user {user_id}")

    elif content_ref.startswith("gallery:business:"):
        business_id = content_ref[17:]
        await db.businesses.update_one(
            {"business_id": business_id},
            {"$addToSet": {"gallery_videos": playback_url}},
        )
        logger.info(f"[Mux] Added gallery video for business {business_id}")
