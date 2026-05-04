"""Music routes - Jamendo API integration for royalty-free music."""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
import httpx
import os
from functools import lru_cache
from datetime import datetime, timedelta

router = APIRouter(prefix="/music", tags=["Music"])

# Jamendo API configuration
JAMENDO_API_URL = "https://api.jamendo.com/v3.0"
JAMENDO_CLIENT_ID = os.environ.get("JAMENDO_CLIENT_ID", "")

# Cache for music tracks
music_cache = {}
CACHE_DURATION = timedelta(hours=24)


class MusicTrack(BaseModel):
    id: str
    name: str
    artist_name: str
    artist_id: str
    duration: int
    audio_url: str
    audio_download_url: Optional[str] = None
    image_url: Optional[str] = None
    album_name: Optional[str] = None
    genre: Optional[str] = None
    releasedate: Optional[str] = None
    license_url: Optional[str] = None


class MusicSearchResponse(BaseModel):
    tracks: List[MusicTrack]
    total: int
    page: int
    per_page: int


# Predefined genres and moods for the app
MUSIC_GENRES = [
    "pop", "rock", "electronic", "hiphop", "jazz", "classical", 
    "ambient", "folk", "metal", "reggae", "latin", "country",
    "rnb", "soul", "indie", "punk", "blues", "world"
]

MUSIC_MOODS = [
    "happy", "sad", "energetic", "calm", "romantic", "dark",
    "uplifting", "melancholic", "aggressive", "peaceful", "dreamy",
    "epic", "funny", "mysterious", "nostalgic", "powerful"
]


@router.get("/search", response_model=MusicSearchResponse)
async def search_music(
    query: Optional[str] = Query(None, description="Search query"),
    genre: Optional[str] = Query(None, description="Filter by genre"),
    mood: Optional[str] = Query(None, description="Filter by mood/tag"),
    duration_min: Optional[int] = Query(None, description="Minimum duration in seconds"),
    duration_max: Optional[int] = Query(None, description="Maximum duration in seconds"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=50, description="Results per page")
):
    """
    Search for royalty-free music tracks from Jamendo.
    All tracks are Creative Commons licensed and free to use.
    """
    
    # If no Jamendo client ID, return fallback tracks directly
    if not JAMENDO_CLIENT_ID:
        return get_fallback_tracks(page, per_page)
    
    # Build cache key
    cache_key = f"{query}_{genre}_{mood}_{duration_min}_{duration_max}_{page}_{per_page}"
    
    # Check cache
    if cache_key in music_cache:
        cached_data, cached_time = music_cache[cache_key]
        if datetime.now() - cached_time < CACHE_DURATION:
            return cached_data
    
    # Build Jamendo API request
    params = {
        "client_id": JAMENDO_CLIENT_ID,
        "format": "json",
        "limit": per_page,
        "offset": (page - 1) * per_page,
        "include": "musicinfo",
        "audioformat": "mp32",  # Get streaming-quality MP3
    }
    
    # Add search parameters
    if query:
        params["search"] = query
    if genre:
        params["tags"] = genre
    if mood:
        # Jamendo uses tags for moods
        existing_tags = params.get("tags", "")
        params["tags"] = f"{existing_tags}+{mood}" if existing_tags else mood
    if duration_min:
        params["durationbetween"] = f"{duration_min}_"
    if duration_max:
        if "durationbetween" in params:
            params["durationbetween"] = params["durationbetween"] + str(duration_max)
        else:
            params["durationbetween"] = f"_{duration_max}"
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{JAMENDO_API_URL}/tracks/",
                params=params
            )
            
            if response.status_code != 200:
                # If Jamendo fails, return curated fallback tracks
                return get_fallback_tracks(page, per_page)
            
            data = response.json()
            
            # Parse response
            tracks = []
            for track in data.get("results", []):
                tracks.append(MusicTrack(
                    id=str(track.get("id")),
                    name=track.get("name", "Unknown Track"),
                    artist_name=track.get("artist_name", "Unknown Artist"),
                    artist_id=str(track.get("artist_id", "")),
                    duration=track.get("duration", 0),
                    audio_url=track.get("audio", ""),
                    audio_download_url=track.get("audiodownload", ""),
                    image_url=track.get("image", ""),
                    album_name=track.get("album_name", ""),
                    genre=track.get("musicinfo", {}).get("tags", {}).get("genres", [None])[0] if track.get("musicinfo") else None,
                    releasedate=track.get("releasedate", ""),
                    license_url=track.get("license_ccurl", "")
                ))
            
            result = MusicSearchResponse(
                tracks=tracks,
                total=data.get("headers", {}).get("results_fullcount", len(tracks)),
                page=page,
                per_page=per_page
            )
            
            # Cache the result
            music_cache[cache_key] = (result, datetime.now())
            
            return result
            
    except Exception as e:
        print(f"[Music] Jamendo API error: {e}")
        return get_fallback_tracks(page, per_page)


@router.get("/genres")
async def get_genres():
    """Get available music genres for filtering."""
    return {"genres": MUSIC_GENRES}


@router.get("/moods")
async def get_moods():
    """Get available music moods/tags for filtering."""
    return {"moods": MUSIC_MOODS}


@router.get("/featured")
async def get_featured_tracks(limit: int = Query(30, ge=1, le=50)):
    """
    Get featured/popular tracks for quick selection.
    Returns a curated list of high-quality royalty-free tracks, randomly ordered.
    """
    import random
    
    # If no Jamendo client ID, return fallback tracks directly
    if not JAMENDO_CLIENT_ID:
        fallback = get_fallback_tracks(1, limit)
        tracks = [t.model_dump() for t in fallback.tracks]
        random.shuffle(tracks)
        return {"tracks": tracks}
    
    params = {
        "client_id": JAMENDO_CLIENT_ID,
        "format": "json",
        "limit": limit,
        "order": "popularity_total",
        "audioformat": "mp32",
        "include": "musicinfo"
    }
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{JAMENDO_API_URL}/tracks/",
                params=params
            )
            
            if response.status_code != 200:
                fallback = get_fallback_tracks(1, limit)
                return {"tracks": [t.model_dump() for t in fallback.tracks]}
            
            data = response.json()
            
            tracks = []
            for track in data.get("results", []):
                tracks.append(MusicTrack(
                    id=str(track.get("id")),
                    name=track.get("name", "Unknown Track"),
                    artist_name=track.get("artist_name", "Unknown Artist"),
                    artist_id=str(track.get("artist_id", "")),
                    duration=track.get("duration", 0),
                    audio_url=track.get("audio", ""),
                    audio_download_url=track.get("audiodownload", ""),
                    image_url=track.get("image", ""),
                    album_name=track.get("album_name", ""),
                    genre=track.get("musicinfo", {}).get("tags", {}).get("genres", [None])[0] if track.get("musicinfo") else None,
                    releasedate=track.get("releasedate", ""),
                    license_url=track.get("license_ccurl", "")
                ))
            
            # Shuffle tracks for variety
            random.shuffle(tracks)
            return {"tracks": tracks}
            
    except Exception as e:
        print(f"[Music] Featured tracks error: {e}")
        fallback = get_fallback_tracks(1, limit)
        tracks = [t.model_dump() for t in fallback.tracks]
        random.shuffle(tracks)
        return {"tracks": tracks}


@router.get("/track/{track_id}")
async def get_track_details(track_id: str):
    """Get detailed information about a specific track."""
    params = {
        "client_id": JAMENDO_CLIENT_ID,
        "format": "json",
        "id": track_id,
        "audioformat": "mp32",
        "include": "musicinfo+lyrics"
    }
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{JAMENDO_API_URL}/tracks/",
                params=params
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=404, detail="Track not found")
            
            data = response.json()
            results = data.get("results", [])
            
            if not results:
                raise HTTPException(status_code=404, detail="Track not found")
            
            track = results[0]
            
            return MusicTrack(
                id=str(track.get("id")),
                name=track.get("name", "Unknown Track"),
                artist_name=track.get("artist_name", "Unknown Artist"),
                artist_id=str(track.get("artist_id", "")),
                duration=track.get("duration", 0),
                audio_url=track.get("audio", ""),
                audio_download_url=track.get("audiodownload", ""),
                image_url=track.get("image", ""),
                album_name=track.get("album_name", ""),
                genre=track.get("musicinfo", {}).get("tags", {}).get("genres", [None])[0] if track.get("musicinfo") else None,
                releasedate=track.get("releasedate", ""),
                license_url=track.get("license_ccurl", "")
            )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Music] Track details error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch track details")


def get_fallback_tracks(page: int, per_page: int) -> MusicSearchResponse:
    """
    Return fallback royalty-free tracks when Jamendo API is unavailable.
    These are sample tracks from soundhelix.com (royalty-free).
    """
    import random
    
    fallback_tracks = [
        MusicTrack(id="fallback_1", name="Upbeat Pop", artist_name="Royalty Free", artist_id="0", duration=180, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", image_url=None, genre="pop"),
        MusicTrack(id="fallback_2", name="Chill Vibes", artist_name="Royalty Free", artist_id="0", duration=200, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", image_url=None, genre="ambient"),
        MusicTrack(id="fallback_3", name="Energetic Beat", artist_name="Royalty Free", artist_id="0", duration=220, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", image_url=None, genre="electronic"),
        MusicTrack(id="fallback_4", name="Acoustic Guitar", artist_name="Royalty Free", artist_id="0", duration=195, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", image_url=None, genre="folk"),
        MusicTrack(id="fallback_5", name="Happy Days", artist_name="Royalty Free", artist_id="0", duration=210, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", image_url=None, genre="pop"),
        MusicTrack(id="fallback_6", name="Dramatic", artist_name="Royalty Free", artist_id="0", duration=240, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", image_url=None, genre="classical"),
        MusicTrack(id="fallback_7", name="Romantic", artist_name="Royalty Free", artist_id="0", duration=185, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3", image_url=None, genre="jazz"),
        MusicTrack(id="fallback_8", name="Party Mode", artist_name="Royalty Free", artist_id="0", duration=230, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3", image_url=None, genre="electronic"),
        MusicTrack(id="fallback_9", name="Ambient Space", artist_name="Royalty Free", artist_id="0", duration=190, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3", image_url=None, genre="ambient"),
        MusicTrack(id="fallback_10", name="Smooth Jazz", artist_name="Royalty Free", artist_id="0", duration=215, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3", image_url=None, genre="jazz"),
        MusicTrack(id="fallback_11", name="Hip Hop Beat", artist_name="Royalty Free", artist_id="0", duration=175, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3", image_url=None, genre="hiphop"),
        MusicTrack(id="fallback_12", name="Classical Piano", artist_name="Royalty Free", artist_id="0", duration=260, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3", image_url=None, genre="classical"),
        MusicTrack(id="fallback_13", name="Summer Vibes", artist_name="Royalty Free", artist_id="0", duration=188, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3", image_url=None, genre="pop"),
        MusicTrack(id="fallback_14", name="Motivation", artist_name="Royalty Free", artist_id="0", duration=205, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3", image_url=None, genre="electronic"),
        MusicTrack(id="fallback_15", name="Indie Folk", artist_name="Royalty Free", artist_id="0", duration=225, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3", image_url=None, genre="indie"),
        MusicTrack(id="fallback_16", name="Retro Synthwave", artist_name="Royalty Free", artist_id="0", duration=198, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3", image_url=None, genre="electronic"),
        MusicTrack(id="fallback_17", name="Rock Anthem", artist_name="Royalty Free", artist_id="0", duration=235, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", image_url=None, genre="rock"),
        MusicTrack(id="fallback_18", name="Lounge Music", artist_name="Royalty Free", artist_id="0", duration=210, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", image_url=None, genre="jazz"),
        MusicTrack(id="fallback_19", name="EDM Drop", artist_name="Royalty Free", artist_id="0", duration=185, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", image_url=None, genre="electronic"),
        MusicTrack(id="fallback_20", name="Country Roads", artist_name="Royalty Free", artist_id="0", duration=220, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", image_url=None, genre="country"),
        MusicTrack(id="fallback_21", name="R&B Groove", artist_name="Royalty Free", artist_id="0", duration=195, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", image_url=None, genre="rnb"),
        MusicTrack(id="fallback_22", name="Metal Riff", artist_name="Royalty Free", artist_id="0", duration=180, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", image_url=None, genre="metal"),
        MusicTrack(id="fallback_23", name="Reggae Vibes", artist_name="Royalty Free", artist_id="0", duration=240, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3", image_url=None, genre="reggae"),
        MusicTrack(id="fallback_24", name="Latin Fiesta", artist_name="Royalty Free", artist_id="0", duration=200, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3", image_url=None, genre="latin"),
        MusicTrack(id="fallback_25", name="Blues Guitar", artist_name="Royalty Free", artist_id="0", duration=215, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3", image_url=None, genre="blues"),
        MusicTrack(id="fallback_26", name="World Music", artist_name="Royalty Free", artist_id="0", duration=230, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3", image_url=None, genre="world"),
        MusicTrack(id="fallback_27", name="Punk Rock", artist_name="Royalty Free", artist_id="0", duration=165, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3", image_url=None, genre="punk"),
        MusicTrack(id="fallback_28", name="Soul Classic", artist_name="Royalty Free", artist_id="0", duration=205, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3", image_url=None, genre="soul"),
        MusicTrack(id="fallback_29", name="Cinematic Epic", artist_name="Royalty Free", artist_id="0", duration=280, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3", image_url=None, genre="classical"),
        MusicTrack(id="fallback_30", name="Lo-Fi Beats", artist_name="Royalty Free", artist_id="0", duration=190, audio_url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3", image_url=None, genre="ambient"),
    ]
    
    # Shuffle for variety
    random.shuffle(fallback_tracks)
    
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paginated = fallback_tracks[start_idx:end_idx]
    
    return MusicSearchResponse(
        tracks=paginated,
        total=len(fallback_tracks),
        page=page,
        per_page=per_page
    )
