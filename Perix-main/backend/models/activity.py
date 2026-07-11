"""Activity-related Pydantic models."""
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
from models.user import ThemeSettings
from models.focal_point import FocalPoint


# Predefined activity themes with emojis, categories, and subcategories
ACTIVITY_THEMES = {
    "casual_walk_meetup":       {"emoji": "🚶", "label": "Casual Walk Meetup",       "shortLabel": "Walk",          "color": "#4CAF50", "gradient": ["#4CAF50", "#388E3C"], "category": "movement_outdoor",  "subcategory": "walking_activities"},
    "morning_coffee_walk":      {"emoji": "☕", "label": "Morning Coffee Walk",       "shortLabel": "Coffee Walk",    "color": "#8BC34A", "gradient": ["#8BC34A", "#689F38"], "category": "movement_outdoor",  "subcategory": "walking_activities"},
    "sunset_walk":              {"emoji": "🌅", "label": "Sunset Walk",               "shortLabel": "Sunset Walk",    "color": "#FF9800", "gradient": ["#FF9800", "#F57C00"], "category": "movement_outdoor",  "subcategory": "walking_activities"},
    "beginner_run_club":        {"emoji": "🏃", "label": "Beginner Run Club",         "shortLabel": "Run Club",       "color": "#4CAF50", "gradient": ["#4CAF50", "#388E3C"], "category": "movement_outdoor",  "subcategory": "light_fitness"},
    "stretching_in_the_park":   {"emoji": "🧘", "label": "Stretching in the Park",    "shortLabel": "Stretch",        "color": "#66BB6A", "gradient": ["#66BB6A", "#43A047"], "category": "movement_outdoor",  "subcategory": "light_fitness"},
    "outdoor_workout_circle":   {"emoji": "💪", "label": "Outdoor Workout Circle",    "shortLabel": "Workout",        "color": "#43A047", "gradient": ["#43A047", "#2E7D32"], "category": "movement_outdoor",  "subcategory": "light_fitness"},
    "bike_ride_meetup":         {"emoji": "🚲", "label": "Bike Ride Meetup",          "shortLabel": "Bike Ride",      "color": "#2196F3", "gradient": ["#2196F3", "#1976D2"], "category": "movement_outdoor",  "subcategory": "city_movement"},
    "casual_football_kickabout":{"emoji": "⚽", "label": "Casual Football Kickabout",  "shortLabel": "Football",       "color": "#FF5722", "gradient": ["#FF5722", "#E64A19"], "category": "simple_sports",     "subcategory": "ball_sports"},
    "basketball_shootaround":   {"emoji": "🏀", "label": "Basketball Shootaround",    "shortLabel": "Basketball",     "color": "#FF7043", "gradient": ["#FF7043", "#F4511E"], "category": "simple_sports",     "subcategory": "ball_sports"},
    "volleyball_circle":        {"emoji": "🏐", "label": "Volleyball Circle",         "shortLabel": "Volleyball",     "color": "#FFC107", "gradient": ["#FFC107", "#FFA000"], "category": "simple_sports",     "subcategory": "ball_sports"},
    "frisbee_in_the_park":      {"emoji": "🥏", "label": "Frisbee in the Park",       "shortLabel": "Frisbee",        "color": "#00BCD4", "gradient": ["#00BCD4", "#0097A7"], "category": "simple_sports",     "subcategory": "racket_easy_games"},
    "ping_pong_meetup":         {"emoji": "🏓", "label": "Ping Pong Meetup",          "shortLabel": "Ping Pong",      "color": "#9C27B0", "gradient": ["#9C27B0", "#7B1FA2"], "category": "simple_sports",     "subcategory": "racket_easy_games"},
    "badminton_in_the_park":    {"emoji": "🏸", "label": "Badminton in the Park",     "shortLabel": "Badminton",      "color": "#E91E63", "gradient": ["#E91E63", "#C2185B"], "category": "simple_sports",     "subcategory": "racket_easy_games"},
    "tennis_wall_practice":     {"emoji": "🎾", "label": "Tennis Wall Practice",      "shortLabel": "Tennis",         "color": "#CDDC39", "gradient": ["#CDDC39", "#AFB42B"], "category": "simple_sports",     "subcategory": "racket_easy_games"},
    "meditation_in_the_park":   {"emoji": "🧘", "label": "Meditation in the Park",    "shortLabel": "Meditation",     "color": "#7C4DFF", "gradient": ["#7C4DFF", "#651FFF"], "category": "calm_wellness",     "subcategory": "mindfulness"},
    "gratitude_walk":           {"emoji": "🙏", "label": "Gratitude Walk",            "shortLabel": "Gratitude Walk", "color": "#B388FF", "gradient": ["#B388FF", "#9575CD"], "category": "calm_wellness",     "subcategory": "mindfulness"},
    "digital_detox_meetup":     {"emoji": "📵", "label": "Digital Detox Meetup",      "shortLabel": "Detox",          "color": "#5C6BC0", "gradient": ["#5C6BC0", "#3F51B5"], "category": "calm_wellness",     "subcategory": "mindfulness"},
    "nature_sit":               {"emoji": "🌳", "label": "Nature Sit",                "shortLabel": "Nature Sit",     "color": "#2E7D32", "gradient": ["#2E7D32", "#1B5E20"], "category": "calm_wellness",     "subcategory": "nature_slow_living"},
    "sunrise_meetup":           {"emoji": "🌄", "label": "Sunrise Meetup",            "shortLabel": "Sunrise",        "color": "#FF8F00", "gradient": ["#FF8F00", "#FF6F00"], "category": "calm_wellness",     "subcategory": "nature_slow_living"},
    "slow_sunday_walk":         {"emoji": "🐌", "label": "Slow Sunday Walk",          "shortLabel": "Sunday Walk",    "color": "#A5D6A7", "gradient": ["#A5D6A7", "#81C784"], "category": "calm_wellness",     "subcategory": "nature_slow_living"},
    "sit_in_the_park_meetup":   {"emoji": "🪑", "label": "Sit in the Park Meetup",    "shortLabel": "Park Hang",      "color": "#FF7043", "gradient": ["#FF7043", "#F4511E"], "category": "social_meetups",    "subcategory": "simple_hangouts"},
    "one_hour_hangout":         {"emoji": "⏰", "label": "One-Hour Hangout",          "shortLabel": "Hangout",        "color": "#FFA726", "gradient": ["#FFA726", "#FB8C00"], "category": "social_meetups",    "subcategory": "simple_hangouts"},
    "bring_your_own_drink_meetup":{"emoji": "🥤", "label": "Bring Your Own Drink",    "shortLabel": "BYO Drink",      "color": "#26C6DA", "gradient": ["#26C6DA", "#00BCD4"], "category": "social_meetups",    "subcategory": "simple_hangouts"},
    "dog_walk_meetup":          {"emoji": "🐕", "label": "Dog Walk Meetup",           "shortLabel": "Dog Walk",       "color": "#8D6E63", "gradient": ["#8D6E63", "#6D4C41"], "category": "social_meetups",    "subcategory": "easy_social_walks"},
    "playlist_walk":            {"emoji": "🎧", "label": "Playlist Walk",             "shortLabel": "Playlist Walk",  "color": "#EC407A", "gradient": ["#EC407A", "#D81B60"], "category": "social_meetups",    "subcategory": "easy_social_walks"},
    "explore_one_street":       {"emoji": "🗺️", "label": "Explore One Street",       "shortLabel": "Explore Street", "color": "#29B6F6", "gradient": ["#29B6F6", "#0288D1"], "category": "social_meetups",    "subcategory": "easy_social_walks"},
    "no_agenda_meetup":         {"emoji": "💬", "label": "No Agenda Meetup",          "shortLabel": "No Agenda",      "color": "#78909C", "gradient": ["#78909C", "#546E7A"], "category": "social_meetups",    "subcategory": "conversation_meetups"},
    "bench_talk":               {"emoji": "🪑", "label": "Bench Talk",                "shortLabel": "Bench Talk",     "color": "#90A4AE", "gradient": ["#90A4AE", "#607D8B"], "category": "social_meetups",    "subcategory": "conversation_meetups"},
}


class ActivityInvite(BaseModel):
    user_id: Optional[str] = None
    email: Optional[EmailStr] = None
    status: str


class TaggedBusinessInfo(BaseModel):
    business_id: str
    name: str
    logo_image: Optional[str] = None


class ActivityCreate(BaseModel):
    title: str
    description: Optional[str] = None
    date: str
    time: str
    location: str
    cover_image_url: Optional[str] = None
    image_urls: List[str] = []
    video_url: Optional[str] = None
    latitude: float
    longitude: float
    max_attendees: Optional[int] = None
    invite_emails: List[EmailStr] = []
    is_private: bool = False
    password: Optional[str] = None
    theme: Optional[str] = None
    custom_theme: Optional[str] = None
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    tagged_business_id: Optional[str] = None
    cover_focal_point: Optional[FocalPoint] = None


class ActivityResponse(BaseModel):
    activity_id: str
    creator_id: str
    title: str
    description: Optional[str]
    date: str
    time: str
    location: str
    cover_image_url: Optional[str] = None
    image_urls: List[str] = []
    video_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    max_attendees: Optional[int]
    invites: List[ActivityInvite]
    created_at: datetime
    my_status: str
    is_creator: bool
    is_private: Optional[bool] = False
    invitation_code: Optional[str] = None
    password: Optional[str] = None
    theme: Optional[str] = None
    custom_theme: Optional[str] = None
    tagged_business: Optional[TaggedBusinessInfo] = None
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    profile_theme: Optional[ThemeSettings] = None
    creator: Optional[Dict[str, Any]] = None
    cover_focal_point: Optional[FocalPoint] = None


class ActivityUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    cover_image_url: Optional[str] = None
    image_urls: Optional[List[str]] = None
    video_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    max_attendees: Optional[int] = None
    is_private: Optional[bool] = None
    password: Optional[str] = None
    theme: Optional[str] = None
    custom_theme: Optional[str] = None
    gallery_images: Optional[List[str]] = None
    gallery_videos: Optional[List[str]] = None
    tagged_business_id: Optional[str] = None
    cover_focal_point: Optional[FocalPoint] = None


class ActivityRSVP(BaseModel):
    status: str
    password: Optional[str] = None


class JoinByCodeRequest(BaseModel):
    invitation_code: str
