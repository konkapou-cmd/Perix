"""Categories routes."""
from fastapi import APIRouter
from typing import List, Dict

import database

router = APIRouter(prefix="/categories", tags=["Categories"])


@router.get("", response_model=List[Dict])
async def get_categories():
    return database.CATEGORY_TREE
