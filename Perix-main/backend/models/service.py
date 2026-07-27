"""Services, Time Slots, and Bookings models."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from models.focal_point import FocalPoint


class AvailabilitySlotInput(BaseModel):
    day_of_week: Optional[int] = Field(default=None, ge=0, le=6)  # 0=Sunday...6=Saturday
    date: Optional[str] = None
    start_time: str
    end_time: str
    is_recurring: bool = False


class BulkAvailabilityRequest(BaseModel):
    timezone: str = "Europe/Berlin"
    slots: List[AvailabilitySlotInput]


class ServiceCreate(BaseModel):
    business_id: str
    root_category: Optional[str] = None
    subcategory: Optional[str] = None
    type: str
    name: str
    description: Optional[str] = None
    price: Optional[str] = None
    duration_minutes: Optional[int] = None
    capacity: Optional[int] = None
    facilities: List[str] = []
    beds: Optional[int] = None
    room_size: Optional[str] = None
    room_number: Optional[str] = None
    menu_category: Optional[str] = None
    dietary_tags: List[str] = []
    image_urls: List[str] = []
    cover_image_url: Optional[str] = None
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    video_url: Optional[str] = None
    mux_thumbnail_url: Optional[str] = None
    video_status: Optional[str] = None
    # Per-category fields
    instructor: Optional[str] = None
    difficulty_level: Optional[str] = None
    specialist_name: Optional[str] = None
    service_category: Optional[str] = None
    consultation_type: Optional[str] = None
    meeting_type: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    size_sqm: Optional[int] = None
    floor: Optional[int] = None
    furnished: Optional[bool] = None
    available_from: Optional[str] = None
    lease_duration: Optional[str] = None
    max_guests: Optional[int] = None
    property_type: Optional[str] = None
    deposit: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    mileage_km: Optional[int] = None
    fuel_type: Optional[str] = None
    transmission: Optional[str] = None
    stock_status: Optional[str] = None
    brand: Optional[str] = None
    condition: Optional[str] = None
    treatment_type: Optional[str] = None
    session_type: Optional[str] = None
    calories: Optional[int] = None
    allergens: List[str] = []
    spice_level: Optional[int] = None
    # Extended per-category fields
    duration_days: Optional[int] = None
    duration_months: Optional[int] = None
    includes: Optional[str] = None
    visits_included: Optional[int] = None
    valid_days: Optional[int] = None
    included_services: Optional[List[str]] = Field(default_factory=list)
    sessions_count: Optional[int] = None
    duration_per_session: Optional[int] = None
    special_requests: Optional[str] = None
    pickup_location: Optional[str] = None
    dropoff_location: Optional[str] = None
    reason_for_visit: Optional[str] = None
    insurance_info: Optional[str] = None
    pet_name: Optional[str] = None
    pet_type: Optional[str] = None
    status: Optional[str] = None
    sort_order: Optional[int] = Field(default=0)
    cover_focal_point: Optional[FocalPoint] = None
    availability_slots: List[AvailabilitySlotInput] = Field(default_factory=list)


class ServiceUpdate(BaseModel):
    root_category: Optional[str] = None
    subcategory: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[str] = None
    duration_minutes: Optional[int] = None
    capacity: Optional[int] = None
    facilities: Optional[List[str]] = None
    beds: Optional[int] = None
    room_size: Optional[str] = None
    room_number: Optional[str] = None
    menu_category: Optional[str] = None
    dietary_tags: Optional[List[str]] = None
    image_urls: Optional[List[str]] = None
    cover_image_url: Optional[str] = None
    gallery_images: Optional[List[str]] = None
    gallery_videos: Optional[List[str]] = None
    video_url: Optional[str] = None
    mux_thumbnail_url: Optional[str] = None
    video_status: Optional[str] = None
    is_active: Optional[bool] = None
    instructor: Optional[str] = None
    difficulty_level: Optional[str] = None
    specialist_name: Optional[str] = None
    service_category: Optional[str] = None
    consultation_type: Optional[str] = None
    meeting_type: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    size_sqm: Optional[int] = None
    floor: Optional[int] = None
    furnished: Optional[bool] = None
    available_from: Optional[str] = None
    lease_duration: Optional[str] = None
    max_guests: Optional[int] = None
    property_type: Optional[str] = None
    deposit: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    mileage_km: Optional[int] = None
    fuel_type: Optional[str] = None
    transmission: Optional[str] = None
    stock_status: Optional[str] = None
    brand: Optional[str] = None
    condition: Optional[str] = None
    treatment_type: Optional[str] = None
    session_type: Optional[str] = None
    calories: Optional[int] = None
    allergens: Optional[List[str]] = None
    spice_level: Optional[int] = None
    duration_days: Optional[int] = None
    duration_months: Optional[int] = None
    includes: Optional[str] = None
    visits_included: Optional[int] = None
    valid_days: Optional[int] = None
    included_services: Optional[List[str]] = Field(default_factory=list)
    sessions_count: Optional[int] = None
    duration_per_session: Optional[int] = None
    special_requests: Optional[str] = None
    pickup_location: Optional[str] = None
    dropoff_location: Optional[str] = None
    reason_for_visit: Optional[str] = None
    insurance_info: Optional[str] = None
    pet_name: Optional[str] = None
    pet_type: Optional[str] = None
    status: Optional[str] = None
    sort_order: Optional[int] = None
    cover_focal_point: Optional[FocalPoint] = None
    availability_slots: Optional[List[AvailabilitySlotInput]] = None


class ServiceResponse(BaseModel):
    service_id: str
    business_id: str
    root_category: Optional[str] = None
    subcategory: Optional[str] = None
    type: str
    name: str
    description: Optional[str] = None
    price: Optional[str] = None
    duration_minutes: Optional[int] = None
    capacity: Optional[int] = None
    facilities: List[str] = []
    beds: Optional[int] = None
    room_size: Optional[str] = None
    room_number: Optional[str] = None
    menu_category: Optional[str] = None
    dietary_tags: List[str] = []
    image_urls: List[str] = []
    cover_image_url: Optional[str] = None
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    video_url: Optional[str] = None
    mux_thumbnail_url: Optional[str] = None
    video_status: Optional[str] = None
    cover_focal_point: Optional[FocalPoint] = None
    is_active: bool = True
    status: Optional[str] = None
    created_at: datetime
    instructor: Optional[str] = None
    difficulty_level: Optional[str] = None
    specialist_name: Optional[str] = None
    service_category: Optional[str] = None
    consultation_type: Optional[str] = None
    meeting_type: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    size_sqm: Optional[int] = None
    floor: Optional[int] = None
    furnished: Optional[bool] = None
    available_from: Optional[str] = None
    lease_duration: Optional[str] = None
    max_guests: Optional[int] = None
    property_type: Optional[str] = None
    deposit: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    mileage_km: Optional[int] = None
    fuel_type: Optional[str] = None
    transmission: Optional[str] = None
    stock_status: Optional[str] = None
    brand: Optional[str] = None
    condition: Optional[str] = None
    treatment_type: Optional[str] = None
    session_type: Optional[str] = None
    calories: Optional[int] = None
    allergens: List[str] = []
    spice_level: Optional[int] = None
    duration_days: Optional[int] = None
    duration_months: Optional[int] = None
    includes: Optional[str] = None
    visits_included: Optional[int] = None
    valid_days: Optional[int] = None
    included_services: Optional[List[str]] = Field(default_factory=list)
    sessions_count: Optional[int] = None
    duration_per_session: Optional[int] = None
    special_requests: Optional[str] = None
    pickup_location: Optional[str] = None
    dropoff_location: Optional[str] = None
    reason_for_visit: Optional[str] = None
    insurance_info: Optional[str] = None
    pet_name: Optional[str] = None
    pet_type: Optional[str] = None
    status: Optional[str] = None
    sort_order: Optional[int] = 0


class TimeSlotCreate(BaseModel):
    service_id: str
    day_of_week: Optional[int] = None  # 0=Sun...6=Sat
    start_time: str  # "09:00"
    end_time: str    # "10:00"
    date: Optional[str] = None  # "2026-06-15" for one-time
    is_recurring: bool = False


class TimeSlotResponse(BaseModel):
    slot_id: str
    service_id: str
    day_of_week: Optional[int] = None
    start_time: str
    end_time: str
    date: Optional[str] = None
    is_recurring: bool = False
    is_blocked: bool = False
    is_booked: bool = False


class BlockDateRange(BaseModel):
    from_date: str
    to_date: str
    reason: Optional[str] = None


class BookingCreate(BaseModel):
    service_id: str
    slot_id: Optional[str] = None
    date: str
    end_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    client_name: str
    client_email: Optional[str] = None
    guests: Optional[int] = None
    total_price: Optional[str] = None
    notes: Optional[str] = None
    pet_name: Optional[str] = None
    pet_type: Optional[str] = None
    pickup_location: Optional[str] = None
    dropoff_location: Optional[str] = None
    insurance_info: Optional[str] = None
    reason_for_visit: Optional[str] = None
    special_requests: Optional[str] = None


class BookingResponse(BaseModel):
    booking_id: str
    service_id: str
    slot_id: Optional[str] = None
    business_id: str
    client_id: str
    client_name: str
    client_email: Optional[str] = None
    date: str
    end_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    guests: Optional[int] = None
    total_price: Optional[str] = None
    status: str  # pending | confirmed | cancelled | completed
    notes: Optional[str] = None
    created_at: datetime
    service_name: Optional[str] = None
    business_name: Optional[str] = None
    pet_name: Optional[str] = None
    pet_type: Optional[str] = None
    pickup_location: Optional[str] = None
    dropoff_location: Optional[str] = None
    insurance_info: Optional[str] = None
    reason_for_visit: Optional[str] = None
    special_requests: Optional[str] = None
