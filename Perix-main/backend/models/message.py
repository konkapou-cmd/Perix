"""Message-related Pydantic models."""
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class ChatMessageCreate(BaseModel):
    text: str
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # "image", "video", "audio"


class ChatMessageResponse(BaseModel):
    message_id: str
    user_id: str
    text: str
    created_at: datetime
    author: Optional["UserPublic"] = None
    sender_name: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None


class MessageCreate(BaseModel):
    to_user_id: Optional[str] = None
    to_email: Optional[EmailStr] = None
    to_business_id: Optional[str] = None
    to_artist_id: Optional[str] = None
    entity_type: str = "user"  # "user" | "business" | "artist"
    text: str


class MessageEdit(BaseModel):
    text: str


class MessageResponse(BaseModel):
    message_id: str
    from_user_id: str
    to_user_id: Optional[str] = None
    to_business_id: Optional[str] = None
    to_artist_id: Optional[str] = None
    entity_type: str = "user"  # "user" | "business" | "artist"
    text: str
    created_at: datetime
    edited_at: Optional[datetime] = None
    read: Optional[bool] = False
    read_at: Optional[datetime] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # "image", "video", "audio"


class ConversationResponse(BaseModel):
    entity_type: str  # "user" | "business" | "artist"
    conversation_id: str  # The entity's ID (user_id/business_id/artist_id)
    name: str
    image: Optional[str] = None
    other_user: Optional["UserPublic"] = None
    last_message: Optional[MessageResponse] = None


# Forward reference resolution
from models.user import UserPublic
ChatMessageResponse.model_rebuild()
ConversationResponse.model_rebuild()
