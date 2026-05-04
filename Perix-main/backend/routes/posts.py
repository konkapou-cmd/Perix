"""Posts routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

from database import db
from models.user import UserPublic, ThemeSettings
from models.post import (
    PostCreate, PostUpdate, PostResponse, PostCommentCreate, 
    PostCommentResponse, PostCommentUpdate, PostReaction, BusinessPostInfo
)
from utils.helpers import generate_id, now_utc
from utils.cloudinary_utils import upload_to_cloudinary
from routes.dependencies import get_current_user, resolve_actor, build_user_public, like_matches_actor, get_blocked_user_ids
from datetime import timedelta

router = APIRouter(prefix="/posts", tags=["Posts"])

# Post expiry duration (2 weeks)
POST_EXPIRY_DAYS = 14


async def get_business_info_for_post(post_doc: dict) -> Optional[BusinessPostInfo]:
    """Get business info (with theme) for a post if it was posted by a business."""
    actor_type = post_doc.get("actor_type")
    actor_id = post_doc.get("actor_id")
    if actor_type == "business" and actor_id:
        business_doc = await db.businesses.find_one(
            {"business_id": actor_id},
            {"_id": 0, "name": 1, "logo_image": 1, "theme": 1}
        )
        if business_doc:
            return BusinessPostInfo(
                name=business_doc.get("name"),
                logo_image=business_doc.get("logo_image"),
                theme=business_doc.get("theme")
            )
    return None


def build_post_response(
    post_doc: dict,
    author: UserPublic,
    current_user: UserPublic,
    actor_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    tagged_business: Optional[dict] = None,
    business_info: Optional[BusinessPostInfo] = None,
) -> PostResponse:
    likes = post_doc.get("likes", [])
    comments = post_doc.get("comments", [])
    resolved_actor_type = post_doc.get("actor_type", "user")
    resolved_actor_id = post_doc.get("actor_id", post_doc["user_id"])
    actor_name = post_doc.get("actor_name") or author.name
    actor_avatar = post_doc.get("actor_avatar") or author.profile_photo or author.picture
    like_actor_type = actor_type or "user"
    like_actor_id = actor_id or current_user.user_id
    liked_by_me = any(
        like_matches_actor(like, like_actor_type, like_actor_id) for like in likes
    )
    return PostResponse(
        post_id=post_doc["post_id"],
        user_id=post_doc["user_id"],
        business_id=post_doc.get("business_id"),
        actor_type=resolved_actor_type,
        actor_id=resolved_actor_id,
        actor_name=actor_name,
        actor_avatar=actor_avatar,
        media_ratio=post_doc.get("media_ratio"),
        tagged_user_ids=post_doc.get("tagged_user_ids", []),
        tagged_business_ids=post_doc.get("tagged_business_ids", []),
        tagged_artist_ids=post_doc.get("tagged_artist_ids", []),
        tagged_business=tagged_business,
        text=post_doc["text"],
        image_base64=post_doc.get("image_base64"),
        image_url=post_doc.get("image_url"),
        video_url=post_doc.get("video_url"),
        youtube_link=post_doc.get("youtube_link"),
        soundcloud_url=post_doc.get("soundcloud_url"),
        created_at=post_doc["created_at"],
        author=author,
        business=business_info,
        likes_count=len(likes),
        comments_count=len(comments),
        liked_by_me=liked_by_me,
    )


@router.post("", response_model=PostResponse)
async def create_post(
    payload: PostCreate, current_user: UserPublic = Depends(get_current_user)
):
    actor = await resolve_actor(payload.actor_type, payload.actor_id, current_user)
    created_at = now_utc()
    expires_at = created_at + timedelta(days=POST_EXPIRY_DAYS)
    
    # DEBUG: Log what's being posted
    logger.debug(f"[DEBUG] create_post: actor_type={actor['actor_type']}, actor_id={actor['actor_id']}")
    logger.debug(f"[DEBUG] create_post: payload.actor_type={payload.actor_type}, payload.actor_id={payload.actor_id}")
    
    post_doc = {
        "post_id": generate_id("post"),
        "user_id": current_user.user_id,
        "actor_type": actor["actor_type"],
        "actor_id": actor["actor_id"],
        "actor_name": actor["actor_name"],
        "actor_avatar": actor["actor_avatar"],
        "media_ratio": payload.media_ratio,
        "tagged_user_ids": payload.tagged_user_ids or [],
        "tagged_business_ids": payload.tagged_business_ids or [],
        "tagged_artist_ids": payload.tagged_artist_ids or [],
        "text": payload.text,
        "image_base64": payload.image_base64,  # Legacy support
        "image_url": payload.image_url,         # New Cloudinary URL
        "video_url": payload.video_url,         # Video URL
        "youtube_link": payload.youtube_link,
        "soundcloud_url": payload.soundcloud_url,
        "created_at": created_at,
        "expires_at": expires_at,
        "likes": [],
        "comments": [],
    }
    business_id = payload.business_id
    if actor["actor_type"] == "business":
        business_id = actor["actor_id"]
    if business_id:
        business = await db.businesses.find_one(
            {"business_id": business_id, "owner_id": current_user.user_id},
            {"_id": 0},
        )
        if not business:
            raise HTTPException(status_code=403, detail="Not authorized to post for business")
        post_doc["business_id"] = business_id

    await db.posts.insert_one(post_doc)

    # Create a lightweight snapshot for the new HomePosts feed (Option B)
    home_post_doc = {
        "home_post_id": post_doc["post_id"],
        "post_id": post_doc["post_id"],
        "user_id": post_doc["user_id"],
        "actor_type": post_doc["actor_type"],
        "actor_id": post_doc["actor_id"],
        "actor_name": post_doc["actor_name"],
        "actor_avatar": post_doc.get("actor_avatar"),
        "text": post_doc["text"],
        "image_url": post_doc.get("image_url"),
        "video_url": post_doc.get("video_url"),
        "video_status": post_doc.get("video_status"),
        "mux_asset_id": post_doc.get("mux_asset_id"),
        "mux_playback_id": post_doc.get("mux_playback_id"),
        "mux_thumbnail_url": post_doc.get("mux_thumbnail_url"),
        "youtube_link": post_doc.get("youtube_link"),
        "soundcloud_url": post_doc.get("soundcloud_url"),
        "tagged_user_ids": post_doc.get("tagged_user_ids") or [],
        "tagged_business_ids": post_doc.get("tagged_business_ids") or [],
        "tagged_artist_ids": post_doc.get("tagged_artist_ids") or [],
        "latitude": post_doc.get("latitude"),
        "longitude": post_doc.get("longitude"),
        "created_at_home": created_at,
    }
    try:
        await db.home_posts.insert_one(home_post_doc)
    except Exception:
        # Non-fatal: homepage feed will be rebuilt from HomePosts when loaded
        pass

    # Sync media to gallery (posts + gallery = 15 max)
    MAX_GALLERY_ITEMS = 15
    if actor["actor_type"] == "user":
        user = await db.users.find_one({"user_id": actor["actor_id"]})
        if user:
            current_images = user.get("gallery_images", [])
            current_videos = user.get("gallery_videos", [])
            updates = {}

            if post_doc.get("image_url") and post_doc["image_url"] not in current_images:
                new_images = [post_doc["image_url"]] + current_images
                updates["gallery_images"] = new_images[:MAX_GALLERY_ITEMS]

            if post_doc.get("video_url") and post_doc["video_url"] not in current_videos:
                new_videos = [post_doc["video_url"]] + current_videos
                updates["gallery_videos"] = new_videos[:MAX_GALLERY_ITEMS]

            if updates:
                await db.users.update_one({"user_id": actor["actor_id"]}, {"$set": updates})

    elif actor["actor_type"] == "business":
        business = await db.businesses.find_one({"business_id": actor["actor_id"]})
        if business:
            current_images = business.get("gallery_images", [])
            current_videos = business.get("gallery_videos", [])
            updates = {}

            if post_doc.get("image_url") and post_doc["image_url"] not in current_images:
                new_images = [post_doc["image_url"]] + current_images
                updates["gallery_images"] = new_images[:MAX_GALLERY_ITEMS]

            if post_doc.get("video_url") and post_doc["video_url"] not in current_videos:
                new_videos = [post_doc["video_url"]] + current_videos
                updates["gallery_videos"] = new_videos[:MAX_GALLERY_ITEMS]

            if updates:
                await db.businesses.update_one({"business_id": actor["actor_id"]}, {"$set": updates})

    business_info = await get_business_info_for_post(post_doc)
    return build_post_response(post_doc, current_user, current_user, business_info=business_info)


@router.get("", response_model=List[PostResponse])
async def list_posts(
    business_id: Optional[str] = None,
    actor_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 20,
    skip: int = 0,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    List posts with pagination.
    - limit: Maximum number of posts to return (default 20, max 50)
    - skip: Number of posts to skip for pagination
    """
    # Limit the max to 50 to prevent large responses
    limit = min(limit, 50)
    
    # Get list of hidden user IDs to exclude
    hidden_users = await db.users.find(
        {"is_hidden": True},
        {"_id": 0, "user_id": 1}
    ).to_list(1000)
    hidden_user_ids = [u["user_id"] for u in hidden_users]
    
    # Get list of users that the current user has blocked/reported
    blocked_user_ids = await get_blocked_user_ids(current_user.user_id)
    
    # Combine hidden and blocked user IDs
    excluded_user_ids = list(set(hidden_user_ids + blocked_user_ids))
    
    # Filter out expired posts, hidden posts, and posts from excluded users
    current_time = now_utc()
    query = {
        "$and": [
            {
                "$or": [
                    {"expires_at": {"$gt": current_time}},
                    {"expires_at": {"$exists": False}}  # Include posts without expiry (legacy)
                ]
            },
            {"is_hidden": {"$ne": True}},  # Exclude hidden posts
            {"user_id": {"$nin": excluded_user_ids}},  # Exclude posts from hidden/blocked users
            {"author_id": {"$nin": excluded_user_ids}}  # Also check author_id field
        ]
    }
    if business_id:
        query["business_id"] = business_id
    if actor_type:
        query["actor_type"] = actor_type
    if actor_id:
        query["actor_id"] = actor_id
    
    # Filter by user_id (post author) - use function parameter
    if user_id:
        query["user_id"] = user_id
    
    # DEBUG: Log the query
    logger.debug(f"[DEBUG] list_posts query: actor_type={actor_type}, actor_id={actor_id}, user_id={user_id}, business_id={business_id}")
    logger.debug(f"[DEBUG] list_posts full query: {query}")
    
    # DEBUG: Sample some posts to check what's stored
    sample_posts = await db.posts.find({}, {"_id": 0, "post_id": 1, "user_id": 1, "actor_type": 1, "actor_id": 1, "business_id": 1}).limit(5).to_list(5)
    logger.debug(f"[DEBUG] Sample posts in DB: {sample_posts}")
    
    posts = (
        await db.posts.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
        .to_list(limit)
    )
    user_ids = list({post["user_id"] for post in posts})
    users = await db.users.find(
        {"user_id": {"$in": user_ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(1000)
    user_map = {user["user_id"]: build_user_public(user) for user in users}

# Collect business actor_ids for posts where actor_type is "business"
    business_actor_ids = list({post["actor_id"] for post in posts if post.get("actor_type") == "business" and post.get("actor_id")})
    
    # DEBUG: Log business actor IDs found in posts
    logger.debug(f"[DEBUG] Posts API: Found {len(business_actor_ids)} business actor_ids: {business_actor_ids[:5] if business_actor_ids else 'None'}")
    
    # Fetch businesses if needed
    business_map = {}
    if business_actor_ids:
        businesses = await db.businesses.find(
            {"business_id": {"$in": business_actor_ids}},
            {"_id": 0, "business_id": 1, "name": 1, "logo_image": 1, "theme": 1}
        ).to_list(len(business_actor_ids))
        logger.debug(f"[DEBUG] Posts API: Found {len(businesses)} businesses in DB")
        for b in businesses:
            theme = b.get("theme")
            logger.debug(f"[DEBUG] Posts API: Business {b.get('business_id')} has theme: {theme}")
            business_map[b["business_id"]] = BusinessPostInfo(
                name=b.get("name"),
                logo_image=b.get("logo_image"),
                theme=theme
            )

    response = []
    for post in posts:
        author = user_map.get(post["user_id"], current_user)
        # Get business info if this is a business post
        actor_type_post = post.get("actor_type", "user")
        actor_id_post = post.get("actor_id")
        business_info = business_map.get(actor_id_post) if actor_type_post == "business" and actor_id_post in business_map else None
        response.append(
            build_post_response(post, author, current_user, actor_type, actor_id, business_info=business_info)
        )
    return response


@router.get("/{post_id}")
async def get_single_post(
    post_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """Get a single post by ID with full details for notifications."""
    post = await db.posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Get author info
    author = await db.users.find_one(
        {"user_id": post["user_id"]}, {"_id": 0, "password_hash": 0}
    )
    
    # Get commenter info for all comments
    comments = post.get("comments", [])
    commenter_ids = list({c.get("user_id") for c in comments if c.get("user_id")})
    commenters = await db.users.find(
        {"user_id": {"$in": commenter_ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(100)
    commenter_map = {u["user_id"]: u for u in commenters}
    
    # Enrich comments with user info
    enriched_comments = []
    for comment in comments:
        commenter = commenter_map.get(comment.get("user_id"), {})
        enriched_comments.append({
            **comment,
            "user_name": commenter.get("name", "User"),
            "user_avatar": commenter.get("profile_photo") or commenter.get("picture"),
        })
    
    return {
        "post_id": post["post_id"],
        "user_id": post["user_id"],
        "user_name": post.get("actor_name") or (author.get("name") if author else "User"),
        "user_avatar": post.get("actor_avatar") or (author.get("profile_photo") or author.get("picture") if author else None),
        "text": post.get("text"),
        "media_url": post.get("image_base64") or post.get("video_url"),
        "media_type": "video" if post.get("video_url") else "image" if post.get("image_base64") else None,
        "likes": post.get("likes", []),
        "comments": enriched_comments,
        "created_at": post.get("created_at"),
    }


@router.post("/{post_id}/like", response_model=PostResponse)
async def toggle_post_like(
    post_id: str,
    payload: Optional[PostReaction] = None,
    current_user: UserPublic = Depends(get_current_user),
):
    post = await db.posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    actor = await resolve_actor(
        payload.actor_type if payload else None,
        payload.actor_id if payload else None,
        current_user,
    )
    likes = post.get("likes", [])
    if any(like_matches_actor(like, actor["actor_type"], actor["actor_id"]) for like in likes):
        likes = [
            like
            for like in likes
            if not like_matches_actor(like, actor["actor_type"], actor["actor_id"])
        ]
    else:
        likes.append(
            {
                "actor_type": actor["actor_type"],
                "actor_id": actor["actor_id"],
                "actor_name": actor["actor_name"],
                "actor_avatar": actor["actor_avatar"],
                "created_at": now_utc(),
            }
        )
    post["likes"] = likes
    await db.posts.update_one({"post_id": post_id}, {"$set": {"likes": likes}})
    author_doc = await db.users.find_one({"user_id": post["user_id"]}, {"_id": 0})
    author = build_user_public(author_doc) if author_doc else current_user
    business_info = await get_business_info_for_post(post)
    return build_post_response(post, author, current_user, actor["actor_type"], actor["actor_id"], business_info=business_info)


@router.post("/{post_id}/comments", response_model=PostResponse)
async def add_post_comment(
    post_id: str,
    payload: PostCommentCreate,
    current_user: UserPublic = Depends(get_current_user),
):
    post = await db.posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    comments = post.get("comments", [])
    actor = await resolve_actor(payload.actor_type, payload.actor_id, current_user)
    comment_doc = {
        "comment_id": generate_id("cmt"),
        "user_id": current_user.user_id,
        "actor_type": actor["actor_type"],
        "actor_id": actor["actor_id"],
        "actor_name": actor["actor_name"],
        "actor_avatar": actor["actor_avatar"],
        "text": payload.text,
        "created_at": now_utc(),
        "likes": [],
    }
    comments.append(comment_doc)
    post["comments"] = comments
    await db.posts.update_one({"post_id": post_id}, {"$set": {"comments": comments}})
    author_doc = await db.users.find_one({"user_id": post["user_id"]}, {"_id": 0})
    author = build_user_public(author_doc) if author_doc else current_user
    business_info = await get_business_info_for_post(post)
    return build_post_response(post, author, current_user, actor["actor_type"], actor["actor_id"], business_info=business_info)


@router.put("/{post_id}", response_model=PostResponse)
async def update_post(
    post_id: str,
    payload: PostUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    post = await db.posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.get("user_id") != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    update_data = {key: value for key, value in payload.dict().items() if value is not None}
    if update_data:
        await db.posts.update_one({"post_id": post_id}, {"$set": update_data})
        post.update(update_data)
    author_doc = await db.users.find_one({"user_id": post["user_id"]}, {"_id": 0})
    author = build_user_public(author_doc) if author_doc else current_user
    business_info = await get_business_info_for_post(post)
    return build_post_response(post, author, current_user, business_info=business_info)


@router.delete("/{post_id}")
async def delete_post(
    post_id: str, current_user: UserPublic = Depends(get_current_user)
):
    post = await db.posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.get("user_id") != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Remove media from gallery before deleting post
    actor_type = post.get("actor_type", "user")
    actor_id = post.get("actor_id") or post.get("user_id")
    image_url = post.get("image_url")
    video_url = post.get("video_url")

    if actor_type == "user" and actor_id:
        updates = {}
        if image_url:
            await db.users.update_one(
                {"user_id": actor_id},
                {"$pull": {"gallery_images": image_url}}
            )
        if video_url:
            await db.users.update_one(
                {"user_id": actor_id},
                {"$pull": {"gallery_videos": video_url}}
            )
    elif actor_type == "business" and actor_id:
        if image_url:
            await db.businesses.update_one(
                {"business_id": actor_id},
                {"$pull": {"gallery_images": image_url}}
            )
        if video_url:
            await db.businesses.update_one(
                {"business_id": actor_id},
                {"$pull": {"gallery_videos": video_url}}
            )

    await db.posts.delete_one({"post_id": post_id})
    return {"status": "deleted"}


@router.get("/{post_id}/comments", response_model=List[PostCommentResponse])
async def list_post_comments(
    post_id: str, current_user: UserPublic = Depends(get_current_user)
):
    post = await db.posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    comments = post.get("comments", [])
    user_ids = list({comment["user_id"] for comment in comments})
    users = await db.users.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(200)
    user_map = {user["user_id"]: build_user_public(user) for user in users}
    response = []
    for comment in comments:
        author = user_map.get(comment["user_id"], current_user)
        actor_type = comment.get("actor_type", "user")
        actor_name = comment.get("actor_name")
        actor_avatar = comment.get("actor_avatar")
        actor_id = comment.get("actor_id")
        comment_likes = comment.get("likes", [])
        like_actor_type = actor_type or "user"
        like_actor_id = actor_id or current_user.user_id
        liked_by_me = any(
            like_matches_actor(like, like_actor_type, like_actor_id) for like in comment_likes
        )
        response.append(
            PostCommentResponse(
                comment_id=comment["comment_id"],
                user_id=comment["user_id"],
                actor_type=actor_type,
                actor_id=actor_id,
                actor_name=actor_name,
                actor_avatar=actor_avatar,
                text=comment["text"],
                created_at=comment["created_at"],
                likes_count=len(comment_likes),
                liked_by_me=liked_by_me,
                author=author if actor_type == "user" else None,
            )
        )
    return response


@router.put("/{post_id}/comments/{comment_id}", response_model=PostResponse)
async def update_post_comment(
    post_id: str,
    comment_id: str,
    payload: PostCommentUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    post = await db.posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    comments = post.get("comments", [])
    updated = False
    for comment in comments:
        if comment.get("comment_id") == comment_id:
            if comment.get("user_id") != current_user.user_id:
                raise HTTPException(status_code=403, detail="Not authorized")
            comment["text"] = payload.text
            comment["updated_at"] = now_utc()
            updated = True
            break
    if not updated:
        raise HTTPException(status_code=404, detail="Comment not found")
    await db.posts.update_one({"post_id": post_id}, {"$set": {"comments": comments}})
    post["comments"] = comments
    author_doc = await db.users.find_one({"user_id": post["user_id"]}, {"_id": 0})
    author = build_user_public(author_doc) if author_doc else current_user
    business_info = await get_business_info_for_post(post)
    return build_post_response(post, author, current_user, business_info=business_info)


@router.delete("/{post_id}/comments/{comment_id}", response_model=PostResponse)
async def delete_post_comment(
    post_id: str,
    comment_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    post = await db.posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    comments = post.get("comments", [])
    target = next((c for c in comments if c.get("comment_id") == comment_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Comment not found")
    if target.get("user_id") != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    comments = [c for c in comments if c.get("comment_id") != comment_id]
    await db.posts.update_one({"post_id": post_id}, {"$set": {"comments": comments}})
    post["comments"] = comments
    author_doc = await db.users.find_one({"user_id": post["user_id"]}, {"_id": 0})
    author = build_user_public(author_doc) if author_doc else current_user
    business_info = await get_business_info_for_post(post)
    return build_post_response(post, author, current_user, business_info=business_info)


@router.post("/{post_id}/comments/{comment_id}/like", response_model=PostCommentResponse)
async def toggle_comment_like(
    post_id: str,
    comment_id: str,
    payload: Optional[PostReaction] = None,
    current_user: UserPublic = Depends(get_current_user),
):
    post = await db.posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    comments = post.get("comments", [])
    target = next((c for c in comments if c.get("comment_id") == comment_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Comment not found")
    actor = await resolve_actor(
        payload.actor_type if payload else None,
        payload.actor_id if payload else None,
        current_user,
    )
    comment_likes = target.get("likes", [])
    if any(like_matches_actor(like, actor["actor_type"], actor["actor_id"]) for like in comment_likes):
        comment_likes = [
            like for like in comment_likes
            if not like_matches_actor(like, actor["actor_type"], actor["actor_id"])
        ]
    else:
        comment_likes.append({
            "actor_type": actor["actor_type"],
            "actor_id": actor["actor_id"],
            "actor_name": actor["actor_name"],
            "actor_avatar": actor["actor_avatar"],
            "created_at": now_utc(),
        })
    for c in comments:
        if c.get("comment_id") == comment_id:
            c["likes"] = comment_likes
            break
    await db.posts.update_one({"post_id": post_id}, {"$set": {"comments": comments}})
    author_doc = await db.users.find_one({"user_id": target["user_id"]}, {"_id": 0})
    author = build_user_public(author_doc) if author_doc else current_user
    actor_type = target.get("actor_type", "user")
    liked_by_me = any(
        like_matches_actor(like, actor["actor_type"], actor["actor_id"]) for like in comment_likes
    )
    return PostCommentResponse(
        comment_id=target["comment_id"],
        user_id=target["user_id"],
        actor_type=actor_type,
        actor_id=target.get("actor_id"),
        actor_name=target.get("actor_name"),
        actor_avatar=target.get("actor_avatar"),
        text=target["text"],
        created_at=target["created_at"],
        likes_count=len(comment_likes),
        liked_by_me=liked_by_me,
        author=author if actor_type == "user" else None,
    )
