"""Search routes - Geospatial search for artists and posts."""
from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from math import radians, cos, sin, asin, sqrt
from pydantic import BaseModel

from database import db
from models.user import UserPublic
from routes.dependencies import get_current_user, geocode_town, build_user_public

router = APIRouter(prefix="/search", tags=["Search"])

# 25 km in meters
SEARCH_RADIUS_METERS = 25000


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance between two points in meters using haversine formula."""
    R = 6371000
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * R * asin(sqrt(a))


class ArtistSearchResult(BaseModel):
    artist_id: str
    name: str
    bio: Optional[str] = None
    genres: List[str] = []
    town: Optional[str] = None
    profile_photo: Optional[str] = None
    cover_photo: Optional[str] = None
    distance_km: Optional[float] = None


class PostSearchResult(BaseModel):
    post_id: str
    user_id: str
    actor_type: Optional[str] = None
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    actor_avatar: Optional[str] = None
    text: str
    image_base64: Optional[str] = None
    video_url: Optional[str] = None
    likes_count: int = 0
    comments_count: int = 0


class GeospatialSearchResponse(BaseModel):
    city: str
    latitude: float
    longitude: float
    radius_km: float
    artists: List[ArtistSearchResult]
    posts: List[PostSearchResult]
    total_artists: int
    total_posts: int


@router.get("/nearby", response_model=GeospatialSearchResponse)
async def search_nearby(
    city: Optional[str] = Query(None, description="City name to search around"),
    latitude: Optional[float] = Query(None, description="Latitude for center point"),
    longitude: Optional[float] = Query(None, description="Longitude for center point"),
    radius_km: float = Query(25.0, description="Search radius in kilometers"),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Search for artists and their posts within a radius of a city or coordinates.
    
    - If city is provided, it will be geocoded to get coordinates
    - If latitude and longitude are provided, they will be used directly
    - Returns artists within the radius and all posts from those artists
    """
    search_lat = latitude
    search_lng = longitude
    city_name = city or "Current Location"
    
    # Geocode city if provided
    if city and not (latitude and longitude):
        coords = await geocode_town(city)
        if coords:
            search_lat = coords["latitude"]
            search_lng = coords["longitude"]
            city_name = city
    
    # Require coordinates
    if search_lat is None or search_lng is None:
        return GeospatialSearchResponse(
            city=city_name,
            latitude=0,
            longitude=0,
            radius_km=radius_km,
            artists=[],
            posts=[],
            total_artists=0,
            total_posts=0,
        )
    
    # Convert radius to meters
    radius_meters = radius_km * 1000
    
    # Find artists within radius — try geo aggregation, fall back to haversine
    artists_raw: List[dict] = []
    try:
        pipeline = [
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": [search_lng, search_lat]},
                    "distanceField": "distance",
                    "maxDistance": radius_meters,
                    "spherical": True,
                    "query": {"location": {"$exists": True, "$ne": None}}
                }
            },
            {"$project": {
                "_id": 0, "artist_id": 1, "name": 1, "bio": 1, "genres": 1,
                "town": 1, "profile_photo": 1, "cover_photo": 1, "gallery_images": 1,
                "distance": 1, "latitude": 1, "longitude": 1,
            }},
            {"$limit": 100}
        ]
        artists_cursor = db.artists.aggregate(pipeline)
        artists_raw = await artists_cursor.to_list(100)
    except Exception:
        all_artists = await db.artists.find(
            {"latitude": {"$exists": True, "$ne": None}, "longitude": {"$exists": True, "$ne": None}},
            {"_id": 0}
        ).to_list(500)
        artists_raw = []
        for a in all_artists:
            d = haversine_m(search_lat, search_lng, a["latitude"], a["longitude"])
            if d <= radius_meters:
                a["distance"] = d
                artists_raw.append(a)
        artists_raw = sorted(artists_raw, key=lambda x: x.get("distance", 0))[:100]
    
    # Build artist results with distance
    artist_results = []
    artist_ids = []
    
    for artist in artists_raw:
        artist_ids.append(artist["artist_id"])
        
        # Get profile photo (fallback to first gallery image)
        profile_photo = artist.get("profile_photo")
        if not profile_photo and artist.get("gallery_images"):
            profile_photo = artist.get("gallery_images")[0]
        
        # Convert distance from meters to km
        distance_km = artist.get("distance", 0) / 1000 if artist.get("distance") else None
        
        artist_results.append(ArtistSearchResult(
            artist_id=artist["artist_id"],
            name=artist["name"],
            bio=artist.get("bio"),
            genres=artist.get("genres", []),
            town=artist.get("town"),
            profile_photo=profile_photo,
            cover_photo=artist.get("cover_photo"),
            distance_km=round(distance_km, 2) if distance_km else None,
        ))
    
    # Find posts from these artists
    posts = []
    if artist_ids:
        posts_cursor = db.posts.find(
            {
                "actor_type": "artist",
                "actor_id": {"$in": artist_ids}
            },
            {"_id": 0}
        ).sort("created_at", -1).limit(100)
        
        posts_raw = await posts_cursor.to_list(100)
        
        for post in posts_raw:
            posts.append(PostSearchResult(
                post_id=post["post_id"],
                user_id=post["user_id"],
                actor_type=post.get("actor_type"),
                actor_id=post.get("actor_id"),
                actor_name=post.get("actor_name"),
                actor_avatar=post.get("actor_avatar"),
                text=post.get("text", ""),
                image_base64=post.get("image_base64"),
                video_url=post.get("video_url"),
                likes_count=len(post.get("likes", [])),
                comments_count=len(post.get("comments", [])),
            ))
    
    return GeospatialSearchResponse(
        city=city_name,
        latitude=search_lat,
        longitude=search_lng,
        radius_km=radius_km,
        artists=artist_results,
        posts=posts,
        total_artists=len(artist_results),
        total_posts=len(posts),
    )


@router.get("/artists/city/{city_name}", response_model=List[ArtistSearchResult])
async def search_artists_by_city(
    city_name: str,
    radius_km: float = Query(25.0, description="Search radius in kilometers"),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Simple endpoint to search artists by city name within 25km radius.
    """
    coords = await geocode_town(city_name)
    if not coords:
        return []
    
    radius_meters = radius_km * 1000
    
    artists_raw: List[dict] = []
    try:
        pipeline = [
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": [coords["longitude"], coords["latitude"]]},
                    "distanceField": "distance",
                    "maxDistance": radius_meters,
                    "spherical": True,
                    "query": {"location": {"$exists": True, "$ne": None}}
                }
            },
            {"$project": {
                "_id": 0, "artist_id": 1, "name": 1, "bio": 1, "genres": 1,
                "town": 1, "profile_photo": 1, "cover_photo": 1, "gallery_images": 1,
                "distance": 1,
            }},
            {"$limit": 50}
        ]
        artists_cursor = db.artists.aggregate(pipeline)
        artists_raw = await artists_cursor.to_list(50)
    except Exception:
        all_artists = await db.artists.find(
            {"latitude": {"$exists": True, "$ne": None}, "longitude": {"$exists": True, "$ne": None}},
            {"_id": 0}
        ).to_list(500)
        for a in all_artists:
            d = haversine_m(coords["latitude"], coords["longitude"], a["latitude"], a["longitude"])
            if d <= radius_meters:
                a["distance"] = d
                artists_raw.append(a)
        artists_raw = sorted(artists_raw, key=lambda x: x.get("distance", 0))[:50]
    
    results = []
    for artist in artists_raw:
        profile_photo = artist.get("profile_photo")
        if not profile_photo and artist.get("gallery_images"):
            profile_photo = artist.get("gallery_images")[0]
        
        distance_km = artist.get("distance", 0) / 1000 if artist.get("distance") else None
        
        results.append(ArtistSearchResult(
            artist_id=artist["artist_id"],
            name=artist["name"],
            bio=artist.get("bio"),
            genres=artist.get("genres", []),
            town=artist.get("town"),
            profile_photo=profile_photo,
            cover_photo=artist.get("cover_photo"),
            distance_km=round(distance_km, 2) if distance_km else None,
        ))
    
    return results


@router.post("/migrate-artist-locations")
async def migrate_artist_locations(
    current_user: UserPublic = Depends(get_current_user),
):
    """
    One-time migration to add GeoJSON location field to existing artists.
    This endpoint updates artists that have latitude/longitude but no location field.
    """
    # Find artists with coordinates but no GeoJSON location
    artists = await db.artists.find(
        {
            "latitude": {"$exists": True, "$ne": None},
            "longitude": {"$exists": True, "$ne": None},
            "$or": [
                {"location": {"$exists": False}},
                {"location": None}
            ]
        },
        {"_id": 0, "artist_id": 1, "latitude": 1, "longitude": 1, "name": 1}
    ).to_list(1000)
    
    updated_count = 0
    for artist in artists:
        lat = artist.get("latitude")
        lng = artist.get("longitude")
        
        if lat is not None and lng is not None:
            location_geojson = {
                "type": "Point",
                "coordinates": [lng, lat]  # GeoJSON uses [lng, lat] order
            }
            
            await db.artists.update_one(
                {"artist_id": artist["artist_id"]},
                {"$set": {"location": location_geojson}}
            )
            updated_count += 1
    
    return {
        "success": True,
        "message": f"Updated {updated_count} artists with GeoJSON location data",
        "updated_count": updated_count
    }
