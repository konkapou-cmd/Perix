"""Authentication routes."""
from fastapi import APIRouter, HTTPException, Response, Request, Depends
from datetime import timedelta
import httpx

from database import db
from models.user import RegisterInput, LoginInput, GoogleSessionInput, AuthResponse, UserPublic, UpgradeToBusinessInput, ChangePasswordInput
from utils.helpers import generate_id, now_utc
from config import SESSION_DAYS
from routes.dependencies import pwd_context, build_user_public, create_session, get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


def set_session_cookie(response: Response, session_token: str) -> None:
    max_age = SESSION_DAYS * 24 * 60 * 60
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=max_age,
        path="/",
    )


@router.post("/register", response_model=AuthResponse, summary="Register new user")
async def register_user(payload: RegisterInput, response: Response):
    """
    Register a new user account.
    
    - **name**: User's display name
    - **email**: Unique email address
    - **password**: Password (will be hashed)
    
    Returns user profile and session token.
    """
    existing = await db.users.find_one(
        {"email": payload.email}, {"_id": 0, "password_hash": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "user_id": generate_id("user"),
        "email": payload.email,
        "name": payload.name,
        "picture": None,
        "password_hash": pwd_context.hash(payload.password),
        "created_at": now_utc(),
        "gallery_images": [],
        "gallery_videos": [],
        "profile_photo": None,
        "cover_photo": None,
        "bio": None,
        "location": payload.city or None,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "friends": [],
        "role": payload.role,
    }
    await db.users.insert_one(user_doc)

    business = None
    if payload.role == "business":
        import database as db_module
        cat_info = db_module.CATEGORY_LOOKUP.get(payload.subcategory or "", {})
        business_name = payload.business_name or f"{payload.name}'s Business"
        business_id = generate_id("biz")
        business_doc = {
            "business_id": business_id,
            "owner_id": user_doc["user_id"],
            "name": business_name,
            "root_category": payload.root_category or "",
            "subcategory": payload.subcategory or "",
            "category": cat_info.get("name", payload.subcategory or "") if cat_info else payload.subcategory,
            "description": "",
            "address": payload.city or "",
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "logo_image": None,
            "profile_photo": None,
            "cover_photo": None,
            "phone": None,
            "website": None,
            "email": payload.email,
            "subscription_status": "trial",
            "trial_expires_at": now_utc() + timedelta(days=90),
            "created_at": now_utc(),
            "gallery_images": [],
            "gallery_videos": [],
            "opening_hours": {},
            "social_links": {},
            "theme": None,
            "enabled_modules": cat_info.get("modules", {}) if cat_info else {},
        }
        await db.businesses.insert_one(business_doc)
        business = business_doc

    session_token = await create_session(user_doc["user_id"])
    set_session_cookie(response, session_token)
    user_public = build_user_public(user_doc)
    resp = AuthResponse(user=user_public, session_token=session_token)
    if business:
        resp.business = business  # type: ignore
    return resp


@router.post("/login", response_model=AuthResponse)
async def login_user(payload: LoginInput, response: Response):
    user = await db.users.find_one({"email": payload.email}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not pwd_context.verify(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    session_token = await create_session(user["user_id"])
    set_session_cookie(response, session_token)
    return AuthResponse(user=build_user_public(user), session_token=session_token)


@router.post("/google-session", response_model=AuthResponse)
async def google_session(payload: GoogleSessionInput, response: Response):
    async with httpx.AsyncClient(timeout=10) as client_http:
        external = await client_http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id},
        )
        if external.status_code != 200:
            raise HTTPException(status_code=401, detail="Google auth failed")
        data = external.json()

    user = await db.users.find_one(
        {"email": data["email"]}, {"_id": 0, "password_hash": 0}
    )
    if not user:
        user = {
            "user_id": generate_id("user"),
            "email": data["email"],
            "name": data.get("name") or "Google User",
            "picture": data.get("picture"),
            "created_at": now_utc(),
            "gallery_images": [],
            "gallery_videos": [],
            "profile_photo": None,
            "cover_photo": None,
            "bio": None,
            "location": None,
            "friends": [],
            "role": "user",
        }
        await db.users.insert_one(user)

    session_token = data["session_token"]
    existing_session = await db.user_sessions.find_one(
        {"session_token": session_token}, {"_id": 0}
    )
    if not existing_session:
        await db.user_sessions.insert_one(
            {
                "user_id": user["user_id"],
                "session_token": session_token,
                "expires_at": now_utc() + timedelta(days=SESSION_DAYS),
                "created_at": now_utc(),
            }
        )

    set_session_cookie(response, session_token)
    return AuthResponse(user=build_user_public(user), session_token=session_token)


@router.get("/me", response_model=UserPublic)
async def get_me(current_user: UserPublic = Depends(get_current_user)):
    return current_user


@router.post("/logout")
async def logout_user(request: Request, response: Response):
    token = request.cookies.get("session_token")
    auth_header = request.headers.get("Authorization")
    if not token and auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()

    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token")
    return {"status": "logged_out"}


@router.post("/upgrade-to-business")
async def upgrade_to_business(
    payload: UpgradeToBusinessInput,
    current_user: UserPublic = Depends(get_current_user),
):
    """Upgrade a user account to a business account."""
    if current_user.role == "business":
        raise HTTPException(status_code=400, detail="Account is already a business")

    existing_count = await db.businesses.count_documents({"owner_id": current_user.user_id})
    if existing_count >= 1:
        raise HTTPException(status_code=400, detail="Business already exists")

    import database as db_module
    cat_info = db_module.CATEGORY_LOOKUP.get(payload.subcategory, {})
    business_name = payload.business_name or f"{current_user.name}'s Business"
    business_id = generate_id("biz")
    business_doc = {
        "business_id": business_id,
        "owner_id": current_user.user_id,
        "name": business_name,
        "root_category": payload.root_category,
        "subcategory": payload.subcategory,
        "category": cat_info.get("name", payload.subcategory),
        "description": "",
        "address": current_user.location or "",
        "latitude": current_user.latitude,
        "longitude": current_user.longitude,
        "logo_image": None,
        "profile_photo": None,
        "cover_photo": None,
        "phone": None,
        "website": None,
        "email": current_user.email,
        "subscription_status": "trial",
        "trial_expires_at": now_utc() + timedelta(days=90),
        "created_at": now_utc(),
        "gallery_images": [],
        "gallery_videos": [],
        "opening_hours": {},
        "social_links": {},
        "theme": None,
        "enabled_modules": cat_info.get("modules", {}),
    }
    await db.businesses.insert_one(business_doc)
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"role": "business"}}
    )
    current_user.role = "business"
    return {"status": "upgraded", "business": business_doc}


@router.put("/change-password")
async def change_password(
    payload: ChangePasswordInput,
    current_user: UserPublic = Depends(get_current_user),
):
    """Change the current user's password."""
    user_doc = await db.users.find_one({"user_id": current_user.user_id})
    if not user_doc or not user_doc.get("password_hash"):
        raise HTTPException(status_code=404, detail="User not found")

    if not pwd_context.verify(payload.current_password, user_doc["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(payload.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"password_hash": pwd_context.hash(payload.new_password)}}
    )
    return {"status": "password_changed"}
