"""Categories routes."""
from fastapi import APIRouter
from typing import List, Dict

import database

router = APIRouter(prefix="/categories", tags=["Categories"])

# Mobility-transport is managed internally (decision v18) and is not part of
# the public category tree. Internal/admin flows keep full access via
# database.CATEGORY_TREE directly.
HIDDEN_PUBLIC_ROOTS = {"mobility-transport"}


@router.get("", response_model=List[Dict])
async def get_categories():
    return [
        root for root in database.CATEGORY_TREE
        if root.get("slug") not in HIDDEN_PUBLIC_ROOTS
    ]
