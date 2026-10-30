"""Small safe projections for entities whose existing member DTOs leak extras.

No changes to authenticated endpoints, user state, Mobility or database schemas.
"""
from datetime import datetime, timezone
import math
import re
from typing import Literal
from pydantic import BaseModel, Field
from fastapi import HTTPException

Kind = Literal["business", "event", "activity", "service", "job", "rental", "product", "home", "post", "artist", "user"]
TABLES = {"business": ("businesses", "business_id"), "event": ("events", "event_id"),
          "activity": ("activities", "activity_id"), "service": ("services", "service_id"),
          "job": ("jobs", "job_id"), "rental": ("services", "service_id"),
          "product": ("listings", "listing_id"), "home": ("listings", "listing_id"),
          "post": ("posts", "post_id"), "artist": ("artists", "artist_id"), "user": ("users", "user_id")}


class CityEntity(BaseModel):
    id: str
    type: Kind
    title: str
    description: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    cover_image: str | None = None
    images: list[str] = Field(default_factory=list)
    videos: list[str] = Field(default_factory=list)
    phone: str | None = None
    website: str | None = None
    category_ids: list[str] = Field(default_factory=list)
    facts: dict[str, str] = Field(default_factory=dict)
    publisher_id: str | None = None
    publisher_type: Literal["business", "artist", "user"] | None = None


def visible_query(kind):
    query = {"is_hidden": {"$ne": True}, "is_deleted": {"$ne": True}, "deletion_pending": {"$ne": True},
             "is_blocked": {"$ne": True}, "is_private": {"$ne": True}, "is_active": {"$ne": False},
             "is_draft": {"$ne": True}, "is_public": {"$ne": False}, "deleted_at": None,
             "visibility": {"$nin": ["private", "friends", "friends_only", "members_only", "invite_only", "invite-only"]},
             "status": {"$nin": ["draft", "unpublished", "hidden", "deleted"]},
             "$and": [{"$or": [{"expires_at": None}, {"expires_at": {"$gt": datetime.now(timezone.utc)}},
                                {"expires_at": {"$gt": datetime.now(timezone.utc).isoformat()}}]}]}
    if kind == "business":
        query["opening_hours.schedule"] = {"$exists": True, "$ne": {}}
    if kind in ("product", "home", "service", "rental", "job"):
        query["status"] = "published"
        query["is_active"] = True
    if kind in ("product", "home"):
        query["listing_type"] = "product" if kind == "product" else "home_rental"
    if kind == "service": query["type"] = {"$ne": "rental_property"}
    if kind == "rental": query["type"] = "rental_property"
    if kind == "event":
        query.update(start_time={"$nin": [None, ""]}, password={"$in": [None, ""]})
    if kind == "activity":
        query.update(time={"$nin": [None, ""]}, password={"$in": [None, ""]})
    if kind == "post": query["is_public"] = True
    return query


def web_url(value):
    return value if isinstance(value, str) and re.match(r"^https?://[^\s]+$", value, re.I) else None


def project(kind, doc):
    if kind in ("product", "home"):
        # Reuse the existing privacy-preserving approximate-location adapter.
        from routes.listings import public_listing_location
        doc = public_listing_location(doc)
    _, id_field = TABLES[kind]
    images = [u for field in ("image_urls", "gallery_images") for u in (doc.get(field) or []) if web_url(u)]
    facts = {}
    for key in ("price", "salary_range", "job_type", "property_type", "bedrooms", "bathrooms", "size_sqm", "date", "time", "start_time", "end_time", "condition", "delivery_method"):
        value = doc.get(key)
        if isinstance(value, (str, int, float, datetime)):
            facts[key] = value.isoformat() if isinstance(value, datetime) else str(value)
    for day, hours in (doc.get("opening_hours", {}).get("schedule", {}) or {}).items() if isinstance(doc.get("opening_hours"), dict) else []:
        if day.lower() in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "mon", "tue", "wed", "thu", "fri", "sat", "sun") and isinstance(hours, dict):
            opened, closed = hours.get("open"), hours.get("close")
            if isinstance(opened, str) and isinstance(closed, str): facts[day] = f"{opened}–{closed}"
    lat, lng = doc.get("latitude"), doc.get("longitude")
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lat, lng)) or abs(lat) > 90 or abs(lng) > 180:
        lat = lng = None
    if kind == "user": lat = lng = None  # Account GPS is never a public profile field.
    publisher_id = doc.get("business_id")
    publisher_type = "business" if publisher_id else None
    if not publisher_id and doc.get("actor_type") in ("business", "artist", "user"):
        publisher_id, publisher_type = doc.get("actor_id"), doc["actor_type"]
    return CityEntity(id=doc[id_field], type=kind, title=str(doc.get("name") or doc.get("title") or doc.get("text", "")[:100] or "Perix"),
                      description=doc.get("description") or doc.get("text") or doc.get("bio"),
                      address=(doc.get("address") or doc.get("location")) if kind != "user" and isinstance(doc.get("address") or doc.get("location"), str) else None,
                      latitude=lat, longitude=lng,
                      cover_image=next((v for v in [doc.get("cover_image_url"), doc.get("cover_image"), doc.get("cover_photo"), doc.get("profile_photo"), doc.get("logo_image"), doc.get("image_url"), *images] if web_url(v)), None),
                      images=list(dict.fromkeys(images)), videos=[u for u in [doc.get("video_url"), *(doc.get("gallery_videos") or [])] if web_url(u)],
                      phone=doc.get("phone") if kind == "business" else None, website=web_url(doc.get("website")),
                      category_ids=[str(v) for v in [doc.get("root_category"), doc.get("subcategory"), doc.get("category"), doc.get("theme"), *doc.get("subcategories", [])] if v],
                      facts=facts, publisher_id=publisher_id, publisher_type=publisher_type)


async def public_parent(db, kind, doc):
    # Never reveal content belonging to hidden/deleted publishers.
    if kind in ("business", "user", "artist"): return True
    actor_type = doc.get("actor_type")
    parent_kind = "business" if doc.get("business_id") else "artist" if doc.get("artist_id") else actor_type if actor_type in ("artist", "business") else "user"
    parent_id = doc.get("business_id") or doc.get("artist_id") or doc.get("actor_id") or doc.get("creator_id") or doc.get("user_id") or doc.get("owner_id")
    if not parent_id: return False
    table, field = TABLES[parent_kind]
    return await db[table].find_one({**visible_query(parent_kind), field: parent_id}, {field: 1}) is not None


async def read_detail(db, kind, entity_id):
    table, id_field = TABLES[kind]
    query = visible_query(kind)
    if kind in ("business", "user"):
        query["$or"] = [{id_field: entity_id}, {"slug": entity_id}]
    else: query[id_field] = entity_id
    doc = await db[table].find_one(query, {"_id": 0})
    if not doc or not await public_parent(db, kind, doc):
        raise HTTPException(404, "Public content not found")
    return project(kind, doc)


async def read_list(db, kind, bounds, *, root=None, subcategories=None, themes=None, property_type=None, job_type=None,
                    service_type=None, q=None, cursor=None, limit=30, city_id="de-magdeburg", publisher_id=None, publisher_type=None):
    table, id_field = TABLES[kind]
    query = visible_query(kind)
    clauses = query.pop("$and", [])
    south, north, west, east = bounds
    if south >= north or west >= east or north - south > 1 or east - west > 2:
        raise HTTPException(422, "Invalid or oversized viewport")
    if not publisher_id:
        spatial = {"latitude": {"$gte": south, "$lte": north}, "longitude": {"$gte": west, "$lte": east}}
        if kind in ("product", "home"):
            from routes.listings import FUZZ_FACTOR
            spatial = {"latitude": {"$gte": south - FUZZ_FACTOR, "$lte": north + FUZZ_FACTOR},
                       "longitude": {"$gte": west - FUZZ_FACTOR, "$lte": east + FUZZ_FACTOR}}
        if kind == "post":
            # A post without a declared public location is scoped by its public
            # publisher, never by private user GPS or an assumed city.
            businesses = await db.businesses.find({**visible_query("business"), **spatial}, {"business_id": 1}).limit(500).to_list(500)
            ids = [b["business_id"] for b in businesses]
            clauses.append({"$or": [spatial, {"city_id": city_id}, {"business_id": {"$in": ids}},
                                    {"actor_type": "business", "actor_id": {"$in": ids}}]})
        else: clauses.append(spatial)
    else:
        if publisher_type not in ("business", "artist", "user"):
            raise HTTPException(422, "Invalid publisher")
        await read_detail(db, publisher_type, publisher_id)
        clauses.append({"$or": [{"actor_type": publisher_type, "actor_id": publisher_id},
                                {"business_id": publisher_id}] if publisher_type == "business" else
                               [{"actor_type": publisher_type, "actor_id": publisher_id}, {"artist_id": publisher_id}] if publisher_type == "artist" else
                               [{"actor_type": publisher_type, "actor_id": publisher_id}]})
    if kind in ("product", "home") and not publisher_id:
        clauses.append({"$or": [{"publication_scope": "profile_and_marketplace"}, {"publication_scope": {"$exists": False}}]})
    if root:
        if kind in ("product", "home"):
            from models.listing import CATEGORY_ALIASES
            query["category"] = {"$in": CATEGORY_ALIASES.get(root, [root])}
        else: query["root_category"] = root
    if subcategories:
        clauses.append({"$or": [{"subcategories": {"$in": subcategories}}, {"subcategory": {"$in": subcategories}}]})
    if themes: clauses.append({"$or": [{"theme": {"$in": themes}}, {"themes": {"$in": themes}}]})
    if service_type and kind == "service": query["type"] = service_type
    if property_type: query["property_type"] = property_type
    if job_type: query["job_type"] = job_type
    if q:
        clauses.append({"$or": [{field: {"$regex": re.escape(q.strip()), "$options": "i"}} for field in ("name", "title", "text")]})
    if cursor: query[id_field] = {"$gt": cursor}
    if clauses: query["$and"] = clauses
    docs = await db[table].find(query, {"_id": 0}).sort(id_field, 1).limit(limit + 1).to_list(limit + 1)
    items = []
    for doc in docs[:limit]:
        if not await public_parent(db, kind, doc): continue
        entity = project(kind, doc)
        if not publisher_id and kind != "post" and entity.latitude is not None and not (south <= entity.latitude <= north and west <= entity.longitude <= east): continue
        items.append(entity)
    return {"items": items, "next_cursor": docs[limit - 1][id_field] if len(docs) > limit else None}


async def read_comments(db, post_id, skip=0, limit=30):
    await read_detail(db, "post", post_id)
    post = await db.posts.find_one({**visible_query("post"), "post_id": post_id}, {"comments": 1})
    rows = (post or {}).get("comments") or []
    items = []
    for comment in rows[skip:skip + limit]:
        if comment.get("is_hidden") or comment.get("is_deleted") or comment.get("is_private") or comment.get("status") in ("draft", "hidden", "deleted"):
            continue
        author = await db.users.find_one({**visible_query("user"), "user_id": comment.get("user_id")}, {"name": 1})
        if not author: continue
        items.append({"id": str(comment.get("comment_id", "")), "text": str(comment.get("text", "")), "author": author.get("name", "Perix")})
    return {"items": items, "next_cursor": skip + limit if len(rows) > skip + limit else None}
