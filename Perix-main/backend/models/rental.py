"""Rental models."""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from models.focal_point import FocalPoint


class RentalCreate(BaseModel):
    title: str
    description: str
    cover_image: Optional[str] = None
    rent_price: Optional[str] = None
    rooms_size: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    available_from: Optional[str] = None
    deposit: Optional[str] = None
    property_type: Optional[str] = None
    gallery_images: List[str] = []
    cover_focal_point: Optional[FocalPoint] = None


class RentalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cover_image: Optional[str] = None
    rent_price: Optional[str] = None
    rooms_size: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    available_from: Optional[str] = None
    deposit: Optional[str] = None
    property_type: Optional[str] = None
    is_active: Optional[bool] = None
    gallery_images: Optional[List[str]] = None
    cover_focal_point: Optional[FocalPoint] = None


class RentalResponse(BaseModel):
    rental_id: str
    business_id: str
    business_name: Optional[str] = None
    business_logo: Optional[str] = None
    title: str
    description: Optional[str] = None
    cover_image: Optional[str] = None
    rent_price: Optional[str] = None
    rooms_size: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    available_from: Optional[str] = None
    deposit: Optional[str] = None
    property_type: Optional[str] = None
    gallery_images: List[str] = []
    is_active: bool = True
    created_at: datetime
    root_category: Optional[str] = None
    subcategory: Optional[str] = None
    cover_focal_point: Optional[FocalPoint] = None
