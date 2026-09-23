"""Shared Pydantic model for cover focal point."""
from pydantic import BaseModel, Field
from typing import Optional


class FocalPoint(BaseModel):
    x: float = Field(default=0.5, ge=0.0, le=1.0)
    y: float = Field(default=0.5, ge=0.0, le=1.0)

    def to_dict(self) -> dict:
        return {"x": self.x, "y": self.y}

    @classmethod
    def default(cls):
        return cls(x=0.5, y=0.5)
