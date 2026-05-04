"""Cloudinary upload utilities.
NOTE: Cloudinary is for PHOTOS ONLY. Videos must use Mux.
"""
import asyncio
import base64
import os
import tempfile
import cloudinary.uploader
from fastapi import HTTPException
from config import CLOUDINARY_URL

# Maximum chunk size for chunked uploads (6MB is safe for most proxies)
CHUNK_SIZE = 6 * 1024 * 1024  # 6MB


async def upload_to_cloudinary(data, resource_type: str = "image", filename: str = None) -> str:
    """
    Upload a file to Cloudinary and return the secure URL.
    Applies automatic optimization for smaller file sizes and faster loading.
    
    NOTE: This is for PHOTOS ONLY. Videos must use Mux.
    
    Args:
        data: Can be:
            - A base64 data URI string (e.g., "data:image/jpeg;base64,...")
            - Raw bytes/binary data
            - A base64-encoded string (without data URI prefix)
        resource_type: "image" only (videos use Mux)
        filename: Optional filename for the upload
    """
    if not CLOUDINARY_URL:
        raise HTTPException(status_code=500, detail="Cloudinary not configured")
    
    if resource_type != "image":
        raise HTTPException(status_code=400, detail="Cloudinary is for photos only. Use Mux for videos.")
    
    # Prepare the data for upload
    upload_data = data
    
    # If data is bytes, convert to base64 data URI
    if isinstance(data, bytes):
        upload_data = f"data:image/jpeg;base64,{base64.b64encode(data).decode('utf-8')}"
    # If it's a string but not a data URI, assume it's raw base64
    elif isinstance(data, str) and not data.startswith("data:"):
        upload_data = f"data:image/jpeg;base64,{data}"
    
    try:
        # Build upload options with optimization
        upload_options = {
            "resource_type": resource_type,
            "folder": "perix",
        }
        
        # Image optimizations:
        # - Auto format (webp/avif when supported)
        # - Auto quality (reduces size while maintaining visual quality)
        # - Max dimension 1920px (covers most screens)
        upload_options.update({
            "transformation": [
                {"width": 1920, "crop": "limit"},  # Max 1920px width
                {"quality": "auto:good"},          # Auto quality optimization
                {"fetch_format": "auto"},          # Auto format (webp/avif)
            ]
        })
        
        result = await asyncio.to_thread(
            cloudinary.uploader.upload,
            upload_data,
            **upload_options
        )
        return result.get("secure_url", "")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cloudinary upload failed: {str(e)}")


async def upload_large_file(file_path: str, resource_type: str = "image", filename: str = None) -> str:
    """
    Upload a large file using Cloudinary's chunked upload.
    NOTE: This is for PHOTOS ONLY. Videos must use Mux.
    
    Args:
        file_path: Path to the file on disk
        resource_type: "image" only
        filename: Optional public_id for the upload
    """
    if not CLOUDINARY_URL:
        raise HTTPException(status_code=500, detail="Cloudinary not configured")
    
    if resource_type != "image":
        raise HTTPException(status_code=400, detail="Cloudinary is for photos only. Use Mux for videos.")
    
    try:
        upload_options = {
            "resource_type": resource_type,
            "folder": "perix",
            "chunk_size": CHUNK_SIZE,  # Upload in 6MB chunks
        }
        
        if filename:
            upload_options["public_id"] = filename
        
        result = await asyncio.to_thread(
            cloudinary.uploader.upload_large,
            file_path,
            **upload_options
        )
        return result.get("secure_url", "")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chunked upload failed: {str(e)}")


async def upload_large_bytes(data: bytes, resource_type: str = "image", filename: str = None) -> str:
    """
    Upload large bytes data using chunked upload.
    Writes to a temp file first, then uses chunked upload.
    NOTE: This is for PHOTOS ONLY. Videos must use Mux.
    
    Args:
        data: Raw bytes data
        resource_type: "image" only
        filename: Optional public_id
    """
    # Write to temp file
    ext = ".mp4" if resource_type == "video" else ".bin"
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    
    try:
        url = await upload_large_file(tmp_path, resource_type, filename)
        return url
    finally:
        # Clean up temp file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def get_optimized_url(url: str, resource_type: str = "image", width: int = None) -> str:
    """
    Transform an existing Cloudinary URL to add optimization parameters.
    Useful for displaying thumbnails or optimized versions.
    
    Args:
        url: Original Cloudinary URL
        resource_type: "image" or "video"
        width: Optional max width for thumbnails
    """
    if not url or "cloudinary.com" not in url:
        return url
    
    # Parse the URL and add transformations
    if resource_type == "image":
        # Add f_auto,q_auto for automatic format and quality
        if "/upload/" in url and "f_auto" not in url:
            parts = url.split("/upload/")
            transform = "f_auto,q_auto"
            if width:
                transform += f",w_{width},c_limit"
            return f"{parts[0]}/upload/{transform}/{parts[1]}"
    elif resource_type == "video":
        # Add video transformations
        if "/upload/" in url and "q_auto" not in url:
            parts = url.split("/upload/")
            transform = "q_auto"
            if width:
                transform += f",w_{width},c_limit"
            return f"{parts[0]}/upload/{transform}/{parts[1]}"
    
    return url

