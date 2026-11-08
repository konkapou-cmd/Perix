"""Chunked upload routes for large files."""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from typing import Optional, Dict
import base64
import logging
import os
import asyncio
import uuid
import tempfile
from datetime import datetime, timedelta

from models.user import UserPublic
from utils.cloudinary_utils import upload_to_cloudinary, upload_large_bytes
from routes.dependencies import get_current_user

router = APIRouter(prefix="/uploads", tags=["Uploads"])
logger = logging.getLogger(__name__)

upload_sessions: Dict[str, dict] = {}

MAX_FILE_SIZE = 350 * 1024 * 1024  # 350MB

SESSION_TIMEOUT_MINUTES = 30

TEMP_DIR = os.path.join(tempfile.gettempdir(), "perix_uploads")
os.makedirs(TEMP_DIR, exist_ok=True)


def _session_temp_path(upload_id: str) -> str:
    return os.path.join(TEMP_DIR, f"upload_{upload_id}.tmp")


def _cleanup_session(upload_id: str):
    if upload_id in upload_sessions:
        session = upload_sessions[upload_id]
        temp_path = session.get("temp_path")
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        del upload_sessions[upload_id]


def cleanup_old_sessions():
    """Remove expired upload sessions and their temp files."""
    now = datetime.utcnow()
    expired = [
        sid for sid, data in upload_sessions.items()
        if now - data.get("created_at", now) > timedelta(minutes=SESSION_TIMEOUT_MINUTES)
    ]
    for sid in expired:
        _cleanup_session(sid)
        logger.info(f"Cleaned up expired upload session: {sid}")


async def _periodic_cleanup(interval_seconds: int = 300):
    """Background task that periodically cleans up orphaned upload sessions."""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            cleanup_old_sessions()
        except Exception as e:
            logger.error(f"Periodic cleanup error: {e}")


_cleanup_started = False


def start_cleanup_task():
    global _cleanup_started
    if not _cleanup_started:
        _cleanup_started = True
        asyncio.create_task(_periodic_cleanup())


@router.post("/direct")
async def upload_direct(
    video_base64: str = Form(...),
    filename: str = Form("video.mp4"),
    current_user: UserPublic = Depends(get_current_user),
):
    raise HTTPException(
        status_code=400,
        detail="Video uploads are not supported via this endpoint. Please use Mux for video uploads."
    )


@router.post("/init")
async def init_chunked_upload(
    filename: str = Form(...),
    file_size: int = Form(...),
    total_chunks: int = Form(...),
    resource_type: str = Form("video"),
    content_type: str = Form("video/mp4"),
    current_user: UserPublic = Depends(get_current_user),
):
    cleanup_old_sessions()
    start_cleanup_task()
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB, got ~{file_size // (1024*1024)}MB"
        )
    
    upload_id = str(uuid.uuid4())
    temp_path = _session_temp_path(upload_id)
    
    with open(temp_path, "wb") as f:
        f.write(b"")
    
    upload_sessions[upload_id] = {
        "user_id": current_user.user_id,
        "filename": filename,
        "file_size": file_size,
        "total_chunks": total_chunks,
        "resource_type": resource_type,
        "content_type": content_type,
        "chunks_received": set(),
        "accumulated_size": 0,
        "temp_path": temp_path,
        "created_at": datetime.utcnow(),
    }
    
    logger.info(f"Initialized chunked upload: {upload_id} ({filename}, {file_size} bytes, {total_chunks} chunks)")
    
    return {
        "upload_id": upload_id,
        "status": "initialized",
        "total_chunks": total_chunks,
    }


@router.post("/chunk")
async def upload_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    chunk: Optional[UploadFile] = File(None),
    chunk_base64: Optional[str] = Form(None),
    chunk_filename: Optional[str] = Form(None),
    current_user: UserPublic = Depends(get_current_user),
):
    if upload_id not in upload_sessions:
        raise HTTPException(status_code=404, detail="Upload session not found or expired")
    
    session = upload_sessions[upload_id]
    
    if session["user_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized for this upload session")
    
    if chunk_index < 0 or chunk_index >= session["total_chunks"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid chunk index. Expected 0 to {session['total_chunks'] - 1}"
        )
    
    chunk_data = None
    
    if chunk_base64:
        try:
            chunk_data = base64.b64decode(chunk_base64)
            logger.info(f"Received base64 chunk {chunk_index + 1} ({len(chunk_data)} bytes)")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to decode base64 chunk: {str(e)}")
    elif chunk:
        chunk_data = await chunk.read()
    else:
        raise HTTPException(status_code=400, detail="No chunk data provided (need either 'chunk' file or 'chunk_base64' string)")
    
    temp_path = session["temp_path"]
    with open(temp_path, "ab") as f:
        f.write(chunk_data)
    
    session["chunks_received"].add(chunk_index)
    session["accumulated_size"] += len(chunk_data)
    
    if session["accumulated_size"] > MAX_FILE_SIZE:
        _cleanup_session(upload_id)
        raise HTTPException(
            status_code=413,
            detail=f"Upload exceeds maximum size of {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    chunks_received = len(session["chunks_received"])
    total_chunks = session["total_chunks"]
    
    logger.info(f"Received chunk {chunk_index + 1}/{total_chunks} for upload {upload_id}")
    
    return {
        "upload_id": upload_id,
        "chunk_index": chunk_index,
        "chunks_received": chunks_received,
        "total_chunks": total_chunks,
        "status": "chunk_received",
    }


@router.post("/complete")
async def complete_chunked_upload(
    upload_id: str = Form(...),
    current_user: UserPublic = Depends(get_current_user),
):
    if upload_id not in upload_sessions:
        raise HTTPException(status_code=404, detail="Upload session not found or expired")
    
    session = upload_sessions[upload_id]
    
    if session["user_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized for this upload session")
    
    chunks_received = len(session["chunks_received"])
    total_chunks = session["total_chunks"]
    
    if chunks_received != total_chunks:
        missing = [i for i in range(total_chunks) if i not in session["chunks_received"]]
        raise HTTPException(
            status_code=400,
            detail=f"Missing chunks: {missing}. Received {chunks_received}/{total_chunks}"
        )
    
    temp_path = session["temp_path"]
    
    try:
        actual_size = os.path.getsize(temp_path)
        expected_size = session["file_size"]
        if abs(actual_size - expected_size) > 1024:
            logger.warning(f"Size mismatch: expected {expected_size}, got {actual_size}")
            if actual_size > MAX_FILE_SIZE:
                raise HTTPException(status_code=413, detail="Assembled file exceeds maximum size")
        
        resource_type = session["resource_type"]
        logger.info(f"Uploading {resource_type} ({actual_size} bytes) from temp file to Cloudinary...")
        
        with open(temp_path, "rb") as f:
            file_bytes = f.read()
        
        if actual_size > 10 * 1024 * 1024:
            url = await upload_large_bytes(file_bytes, resource_type=resource_type)
        else:
            content_type = session["content_type"]
            data_uri = f"data:{content_type};base64,{base64.b64encode(file_bytes).decode('utf-8')}"
            url = await upload_to_cloudinary(data_uri, resource_type=resource_type)
        
        if not url:
            raise HTTPException(status_code=500, detail="Cloudinary returned empty URL")
        
        _cleanup_session(upload_id)
        
        logger.info(f"Chunked upload complete: {url[:50]}...")
        
        return {
            "upload_id": upload_id,
            "url": url,
            "status": "complete",
            "resource_type": resource_type,
        }
        
    except HTTPException:
        _cleanup_session(upload_id)
        raise
    except Exception as e:
        logger.error(f"Failed to complete chunked upload: {str(e)}")
        _cleanup_session(upload_id)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/status/{upload_id}")
async def get_upload_status(
    upload_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    if upload_id not in upload_sessions:
        raise HTTPException(status_code=404, detail="Upload session not found or expired")
    
    session = upload_sessions[upload_id]
    
    if session["user_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized for this upload session")
    
    return {
        "upload_id": upload_id,
        "filename": session["filename"],
        "file_size": session["file_size"],
        "total_chunks": session["total_chunks"],
        "chunks_received": len(session["chunks_received"]),
        "resource_type": session["resource_type"],
        "status": "in_progress",
    }


@router.delete("/cancel/{upload_id}")
async def cancel_chunked_upload(
    upload_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    if upload_id not in upload_sessions:
        raise HTTPException(status_code=404, detail="Upload session not found or expired")
    
    session = upload_sessions[upload_id]
    
    if session["user_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized for this upload session")
    
    _cleanup_session(upload_id)
    logger.info(f"Cancelled upload session: {upload_id}")
    
    return {
        "upload_id": upload_id,
        "status": "cancelled",
    }
