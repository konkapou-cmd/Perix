"""Services, Time Slots, and Bookings models."""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ServiceCreate(BaseModel):
    business_id: str
    type: str  # "room" | "appointment" | "class" | "consultation" | "menu"
    name: str
    description: Optional[str] = None
    price: Optional[str] = None
    duration_minutes: Optional[int] = None
    capacity: Optional[int] = None
    facilities: List[str] = []
    beds: Optional[int] = None
    room_size: Optional[str] = None
    room_number: Optional[str] = None
    menu_category: Optional[str] = None  # starter | main | dessert | drink | side
    dietary_tags: List[str] = []
    images: List[str] = []


class ServiceUpdate(BaseModel):
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
    images: Optional[List[str]] = None
    is_active: Optional[bool] = None


class ServiceResponse(BaseModel):
    service_id: str
    business_id: str
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
    images: List[str] = []
    is_active: bool = True
    created_at: datetime


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
