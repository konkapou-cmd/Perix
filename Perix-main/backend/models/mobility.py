"""Mobility models: vehicles, driver codes/sessions and live location."""
from typing import Optional
from pydantic import BaseModel


class VehicleCreate(BaseModel):
    mode: str  # "bus" | "taxi"
    fleet_number: str
    name: Optional[str] = None
    registration: Optional[str] = None
    route_number: Optional[str] = None
    route_direction: Optional[str] = None


class DriverStartRequest(BaseModel):
    code: str


class DriverLocationUpdate(BaseModel):
    token: str
    latitude: float
    longitude: float
    heading: Optional[float] = None
    speed: Optional[float] = None


class DriverStatusUpdate(BaseModel):
    token: str
    status: str  # bus: good|traffic|stau|problem  taxi: available|busy|offline
