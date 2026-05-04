"""Media upload routes."""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from typing import Optional
from pydantic import BaseModel
import base64
import logging

from models.user import UserPublic
from utils.cloudinary_utils import upload_to_cloudinary, upload_large_bytes
from routes.dependencies import get_current_user
from database import db

router = APIRouter(prefix="/media", tags=["Media"])

logger = logging.getLogger(__name__)

# Maximum file size: 350MB (to allow 300MB videos with some overhead)
MAX_FILE_SIZE = 350 * 1024 * 1024  # 350MB in bytes
# Threshold for using chunked upload (files larger than 10MB use chunked)
CHUNKED_THRESHOLD = 10 * 1024 * 1024  # 10MB


class Base64UploadRequest(BaseModel):
    """Request model for base64 image upload"""
    image_base64: str
    resource_type: str = "image"


class ImageUploadResponse(BaseModel):
    """Response model for image upload"""
    url: str
    resource_type: str


@router.post("/upload")
async def upload_media(
    file: UploadFile = File(...),
    media_type: Optional[str] = Form(None),
    resource_type: Optional[str] = Form(None),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Upload media (image only) to Cloudinary.
    Videos must be uploaded via Mux.
    """
    upload_type = media_type or resource_type or "image"
    
    if upload_type in ("video", "audio"):
        raise HTTPException(
            status_code=400,
            detail="Video uploads are not supported via this endpoint. Please use Mux for video uploads."
        )
    
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty file")
        
        file_size = len(content)
        
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413, 
                detail=f"File too large. Maximum size is 350MB, got {file_size / (1024*1024):.1f}MB"
            )
        
        content_type = file.content_type or "image/jpeg"
        
        logger.info(f"Uploading image ({file_size / (1024*1024):.1f}MB) to Cloudinary")
        
        if file_size > CHUNKED_THRESHOLD:
            logger.info(f"Using chunked upload for large file ({file_size / (1024*1024):.1f}MB)")
            url = await upload_large_bytes(content, resource_type="image")
        else:
            data_uri = f"data:{content_type};base64,{base64.b64encode(content).decode('utf-8')}"
            url = await upload_to_cloudinary(data_uri, resource_type="image")
        
        if not url:
            raise HTTPException(status_code=500, detail="Upload returned empty URL")
            
        logger.info(f"Upload successful: {url[:50]}...")
        return {"url": url, "media_type": "image", "size_mb": round(file_size / (1024*1024), 2)}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/upload-base64", response_model=ImageUploadResponse)
async def upload_base64_image(
    payload: Base64UploadRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Upload a base64 encoded image to Cloudinary.
    This is used by the frontend to upload images before creating posts.
    Returns a Cloudinary URL that can be stored in the database.
    """
    try:
        image_data = payload.image_base64
        
        # Validate base64 data
        if not image_data:
            raise HTTPException(status_code=400, detail="No image data provided")
        
        estimated_size = len(image_data) * 3 // 4
        if estimated_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB, got ~{estimated_size // (1024*1024)}MB"
            )
        
        # Handle data URI format
        if not image_data.startswith("data:"):
            # Assume it's raw base64, add data URI prefix
            image_data = f"data:image/jpeg;base64,{image_data}"
        
        logger.info(f"Uploading base64 image ({len(image_data)} chars) to Cloudinary")
        
        # Upload to Cloudinary with optimizations
        url = await upload_to_cloudinary(image_data, resource_type=payload.resource_type)
        
        if not url:
            raise HTTPException(status_code=500, detail="Upload returned empty URL")
        
        logger.info(f"Base64 upload successful: {url[:50]}...")
        return ImageUploadResponse(url=url, resource_type=payload.resource_type)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Base64 upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/migrate-posts")
async def migrate_posts_to_cloudinary(
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Migrate existing posts with base64 images to use Cloudinary URLs.
    This is an admin operation that should be run once.
    """
    # Find posts with base64 images (they start with "data:image")
    posts_with_base64 = await db.posts.find(
        {
            "image_base64": {"$regex": "^data:image", "$options": "i"}
        },
        {"_id": 0, "post_id": 1, "image_base64": 1}
    ).to_list(100)  # Process 100 at a time
    
    migrated_count = 0
    failed_count = 0
    
    for post in posts_with_base64:
        try:
            image_data = post.get("image_base64")
            if not image_data:
                continue
            
            # Upload to Cloudinary
            url = await upload_to_cloudinary(image_data, resource_type="image")
            
            if url:
                # Update the post with the URL instead of base64
                await db.posts.update_one(
                    {"post_id": post["post_id"]},
                    {"$set": {"image_url": url, "image_base64": None}}
                )
                migrated_count += 1
                logger.info(f"Migrated post {post['post_id']}")
            else:
                failed_count += 1
                
        except Exception as e:
            logger.error(f"Failed to migrate post {post['post_id']}: {str(e)}")
            failed_count += 1
    
    return {
        "success": True,
        "migrated_count": migrated_count,
        "failed_count": failed_count,
        "remaining": len(posts_with_base64) - migrated_count - failed_count
    }


@router.post("/migrate-users")
async def migrate_users_to_cloudinary(
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Migrate user profile photos, cover photos, and gallery images from base64 to Cloudinary URLs.
    """
    migrated_count = 0
    failed_count = 0
    
    # Find users with base64 images
    users = await db.users.find(
        {
            "$or": [
                {"profile_photo": {"$regex": "^data:image", "$options": "i"}},
                {"cover_photo": {"$regex": "^data:image", "$options": "i"}},
                {"picture": {"$regex": "^data:image", "$options": "i"}},
                {"gallery_images": {"$elemMatch": {"$regex": "^data:image", "$options": "i"}}}
            ]
        },
        {"_id": 0, "user_id": 1, "profile_photo": 1, "cover_photo": 1, "picture": 1, "gallery_images": 1}
    ).to_list(100)
    
    for user in users:
        try:
            update_fields = {}
            
            # Migrate profile_photo
            profile = user.get("profile_photo") or ""
            if profile.startswith("data:image"):
                url = await upload_to_cloudinary(profile, resource_type="image")
                if url:
                    update_fields["profile_photo"] = url
                    
            # Migrate cover_photo
            cover = user.get("cover_photo") or ""
            if cover.startswith("data:image"):
                url = await upload_to_cloudinary(cover, resource_type="image")
                if url:
                    update_fields["cover_photo"] = url
                    
            # Migrate picture (alternative field)
            picture = user.get("picture") or ""
            if picture.startswith("data:image"):
                url = await upload_to_cloudinary(picture, resource_type="image")
                if url:
                    update_fields["picture"] = url
            
            # Migrate gallery_images
            gallery = user.get("gallery_images") or []
            if gallery:
                new_gallery = []
                gallery_changed = False
                for img in gallery:
                    if img and isinstance(img, str) and img.startswith("data:image"):
                        url = await upload_to_cloudinary(img, resource_type="image")
                        new_gallery.append(url if url else img)
                        gallery_changed = True
                    else:
                        new_gallery.append(img)
                if gallery_changed:
                    update_fields["gallery_images"] = new_gallery
            
            if update_fields:
                await db.users.update_one(
                    {"user_id": user["user_id"]},
                    {"$set": update_fields}
                )
                migrated_count += 1
                logger.info(f"Migrated user {user['user_id']}")
                
        except Exception as e:
            logger.error(f"Failed to migrate user {user['user_id']}: {str(e)}")
            failed_count += 1
    
    return {
        "success": True,
        "migrated_count": migrated_count,
        "failed_count": failed_count
    }


@router.post("/migrate-businesses")
async def migrate_businesses_to_cloudinary(
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Migrate business logos and photos from base64 to Cloudinary URLs.
    """
    migrated_count = 0
    failed_count = 0
    
    businesses = await db.businesses.find(
        {
            "$or": [
                {"logo_image": {"$regex": "^data:image", "$options": "i"}},
                {"cover_image": {"$regex": "^data:image", "$options": "i"}}
            ]
        },
        {"_id": 0, "business_id": 1, "logo_image": 1, "cover_image": 1, "gallery_images": 1}
    ).to_list(100)
    
    for business in businesses:
        try:
            update_fields = {}
            
            if business.get("logo_image", "").startswith("data:image"):
                url = await upload_to_cloudinary(business["logo_image"], resource_type="image")
                if url:
                    update_fields["logo_image"] = url
                    
            if business.get("cover_image", "").startswith("data:image"):
                url = await upload_to_cloudinary(business["cover_image"], resource_type="image")
                if url:
                    update_fields["cover_image"] = url
            
            # Migrate gallery images
            gallery = business.get("gallery_images", [])
            if gallery:
                new_gallery = []
                for img in gallery:
                    if img and img.startswith("data:image"):
                        url = await upload_to_cloudinary(img, resource_type="image")
                        new_gallery.append(url if url else img)
                    else:
                        new_gallery.append(img)
                if new_gallery != gallery:
                    update_fields["gallery_images"] = new_gallery
            
            if update_fields:
                await db.businesses.update_one(
                    {"business_id": business["business_id"]},
                    {"$set": update_fields}
                )
                migrated_count += 1
                logger.info(f"Migrated business {business['business_id']}")
                
        except Exception as e:
            logger.error(f"Failed to migrate business {business['business_id']}: {str(e)}")
            failed_count += 1
    
    return {
        "success": True,
        "migrated_count": migrated_count,
        "failed_count": failed_count
    }


@router.post("/migrate-post-actors")
async def migrate_post_actors_to_cloudinary(
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Migrate actor_avatar in posts from base64 to Cloudinary URLs.
    """
    migrated_count = 0
    failed_count = 0
    
    # Find posts with base64 actor_avatar
    posts = await db.posts.find(
        {
            "actor_avatar": {"$regex": "^data:image", "$options": "i"}
        },
        {"_id": 0, "post_id": 1, "actor_avatar": 1}
    ).to_list(100)
    
    for post in posts:
        try:
            avatar = post.get("actor_avatar", "")
            if avatar and avatar.startswith("data:image"):
                url = await upload_to_cloudinary(avatar, resource_type="image")
                if url:
                    await db.posts.update_one(
                        {"post_id": post["post_id"]},
                        {"$set": {"actor_avatar": url}}
                    )
                    migrated_count += 1
                    logger.info(f"Migrated actor_avatar for post {post['post_id']}")
                else:
                    failed_count += 1
        except Exception as e:
            logger.error(f"Failed to migrate post actor {post['post_id']}: {str(e)}")
            failed_count += 1
    
    return {
        "success": True,
        "migrated_count": migrated_count,
        "failed_count": failed_count
    }


@router.post("/migrate-all")
async def migrate_all_to_cloudinary(
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Run all migration tasks at once: posts, users, businesses, post actors.
    """
    results = {}
    
    # Posts
    posts_result = await migrate_posts_to_cloudinary(current_user)
    results["posts"] = posts_result
    
    # Users
    users_result = await migrate_users_to_cloudinary(current_user)
    results["users"] = users_result
    
    # Businesses
    businesses_result = await migrate_businesses_to_cloudinary(current_user)
    results["businesses"] = businesses_result
    
    # Post actors
    actors_result = await migrate_post_actors_to_cloudinary(current_user)
    results["post_actors"] = actors_result
    
    return results


@router.post("/migrate-events")
async def migrate_events_to_cloudinary(
    current_user: UserPublic = Depends(get_current_user),
):
    migrated_count = 0
    failed_count = 0
    
    events = await db.events.find(
        {
            "$or": [
                {"image_base64": {"$regex": "^data:image", "$options": "i"}},
                {"images_base64": {"$elemMatch": {"$regex": "^data:image", "$options": "i"}}}
            ]
        },
        {"_id": 0, "event_id": 1, "image_base64": 1, "images_base64": 1, "gallery_images": 1}
    ).to_list(100)
    
    for event in events:
        try:
            update_fields = {}
            
            if event.get("image_base64", "").startswith("data:image"):
                url = await upload_to_cloudinary(event["image_base64"], resource_type="image")
                if url:
                    update_fields["cover_image_url"] = url
                    update_fields["image_urls"] = [url]
                    update_fields["image_base64"] = None
            
            images_base64 = event.get("images_base64", [])
            if images_base64 and any(isinstance(img, str) and img.startswith("data:image") for img in images_base64):
                new_urls = []
                for img in images_base64:
                    if isinstance(img, str) and img.startswith("data:image"):
                        url = await upload_to_cloudinary(img, resource_type="image")
                        if url:
                            new_urls.append(url)
                    elif isinstance(img, str):
                        new_urls.append(img)
                if new_urls:
                    update_fields["image_urls"] = new_urls
                    if "cover_image_url" not in update_fields and new_urls:
                        update_fields["cover_image_url"] = new_urls[0]
                    update_fields["images_base64"] = None
            
            gallery = event.get("gallery_images", [])
            if gallery and any(isinstance(img, str) and img.startswith("data:image") for img in gallery):
                new_gallery = []
                for img in gallery:
                    if isinstance(img, str) and img.startswith("data:image"):
                        url = await upload_to_cloudinary(img, resource_type="image")
                        new_gallery.append(url if url else img)
                    else:
                        new_gallery.append(img)
                update_fields["gallery_images"] = new_gallery
            
            if update_fields:
                await db.events.update_one(
                    {"event_id": event["event_id"]},
                    {"$set": update_fields}
                )
                migrated_count += 1
                logger.info(f"Migrated event {event['event_id']}")
                
        except Exception as e:
            logger.error(f"Failed to migrate event {event['event_id']}: {str(e)}")
            failed_count += 1
    
    return {
        "success": True,
        "migrated_count": migrated_count,
        "failed_count": failed_count
    }


@router.post("/migrate-activities")
async def migrate_activities_to_cloudinary(
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Migrate activity images from base64 to Cloudinary URLs.
    """
    migrated_count = 0
    failed_count = 0
    
    activities = await db.activities.find(
        {
            "$or": [
                {"image_base64": {"$regex": "^data:image", "$options": "i"}},
                {"images_base64": {"$elemMatch": {"$regex": "^data:image", "$options": "i"}}}
            ]
        },
        {"_id": 0, "activity_id": 1, "image_base64": 1, "images_base64": 1, "gallery_images": 1}
    ).to_list(100)
    
    for activity in activities:
        try:
            update_fields = {}
            
            if activity.get("image_base64", "").startswith("data:image"):
                url = await upload_to_cloudinary(activity["image_base64"], resource_type="image")
                if url:
                    update_fields["cover_image_url"] = url
                    update_fields["image_urls"] = [url]
                    update_fields["image_base64"] = None
            
            images_base64 = activity.get("images_base64", [])
            if images_base64 and any(isinstance(img, str) and img.startswith("data:image") for img in images_base64):
                new_urls = []
                for img in images_base64:
                    if isinstance(img, str) and img.startswith("data:image"):
                        url = await upload_to_cloudinary(img, resource_type="image")
                        if url:
                            new_urls.append(url)
                    elif isinstance(img, str):
                        new_urls.append(img)
                if new_urls:
                    update_fields["image_urls"] = new_urls
                    if "cover_image_url" not in update_fields and new_urls:
                        update_fields["cover_image_url"] = new_urls[0]
                    update_fields["images_base64"] = None
            
            gallery = activity.get("gallery_images", [])
            if gallery and any(isinstance(img, str) and img.startswith("data:image") for img in gallery):
                new_gallery = []
                for img in gallery:
                    if isinstance(img, str) and img.startswith("data:image"):
                        url = await upload_to_cloudinary(img, resource_type="image")
                        new_gallery.append(url if url else img)
                    else:
                        new_gallery.append(img)
                update_fields["gallery_images"] = new_gallery
            
            if update_fields:
                await db.activities.update_one(
                    {"activity_id": activity["activity_id"]},
                    {"$set": update_fields}
                )
                migrated_count += 1
                logger.info(f"Migrated activity {activity['activity_id']}")
                
        except Exception as e:
            logger.error(f"Failed to migrate activity {activity['activity_id']}: {str(e)}")
            failed_count += 1
    
    return {
        "success": True,
        "migrated_count": migrated_count,
        "failed_count": failed_count
    }
