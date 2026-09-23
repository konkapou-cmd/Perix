"""Feed-related Pydantic models."""
from pydantic import BaseModel
from typing import List


class HomeFeedResponse(BaseModel):
    posts: List["PostResponse"]
    events: List["EventResponse"]
    businesses: List["BusinessResponse"]
    artists: List["ArtistResponse"]
    activities: List["ActivityResponse"] = []


# Forward reference resolution
from models.post import PostResponse
from models.event import EventResponse
from models.business import BusinessResponse
from models.artist import ArtistResponse
from models.activity import ActivityResponse
HomeFeedResponse.model_rebuild()
