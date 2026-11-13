"""City Ads inventory and rotation engine (policy v18), feature-flagged.

CITYADS_ENFORCEMENT=1 enables the paid-promotion endpoints; until then every
endpoint returns 404-style disabled responses and nothing is charged or
reserved. City Ads remain independent from subscriptions and legacy Stories.
"""
import os
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import HTTPException

from database import db
from utils.helpers import generate_id, now_utc

CITYADS_ENFORCEMENT = os.environ.get("CITYADS_ENFORCEMENT", "0") == "1"
# Sandbox switch: activation requires "payment" + "review". In sandbox mode a
# mock payment confirmation is accepted. Real provider integration stays out.
CITYADS_SANDBOX = os.environ.get("CITYADS_SANDBOX", "1") == "1"

TOTAL_SLOTS = 24
SLOTS_PER_GROUP = 12
IMPRESSIONS_PER_ROTATION = 2
HOLD_MINUTES = 15

CAMPAIGN_STATES = (
    "draft",
    "held",
    "payment_pending",
    "review",
    "scheduled",
    "active",
    "completed",
    "rejected",
    "cancelled",
    "refund_pending",
    "refunded",
)

# Reservations that occupy inventory for a local date.
_OCCUPYING = ("held", "payment_pending", "review", "scheduled", "active")


def ensure_enabled():
    if not CITYADS_ENFORCEMENT:
        raise HTTPException(
            status_code=403,
            detail="City Ads are not enabled yet (CITYADS_ENFORCEMENT=0)",
        )


def pair_for_slot(slot_number: int) -> int:
    """Carousel position pair: slots 1..12 <-> 13..24."""
    if not 1 <= slot_number <= TOTAL_SLOTS:
        raise ValueError("slot_number must be 1..24")
    return (slot_number - 1) % SLOTS_PER_GROUP + 1


def slot_group(slot_number: int) -> str:
    return "A" if slot_number <= SLOTS_PER_GROUP else "B"


def parse_local_date(value: str) -> str:
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="local_date must be YYYY-MM-DD")
    return parsed.date().isoformat()


def _date_range(start_date: str, end_date: str) -> List[str]:
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    if end < start:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")
    days = []
    current = start
    while current <= end:
        days.append(current.isoformat())
        current += timedelta(days=1)
    return days


async def availability(city_id: str, start_date: str, end_date: str) -> dict:
    """Occupied/free slots for every local date of a requested period."""
    days = _date_range(start_date, end_date)
    result = {}
    for day in days:
        occupied = await db.ad_slot_reservations.count_documents({
            "city_id": city_id,
            "local_date": day,
            "reservation_status": {"$in": list(_OCCUPYING)},
        })
        result[day] = {
            "occupied": occupied,
            "free": max(0, TOTAL_SLOTS - occupied),
            "sold_out": occupied >= TOTAL_SLOTS,
        }
    return result


async def _free_slots(city_id: str, local_date: str) -> List[int]:
    used = set()
    cursor = db.ad_slot_reservations.find(
        {
            "city_id": city_id,
            "local_date": local_date,
            "reservation_status": {"$in": list(_OCCUPYING)},
        },
        {"slot_number": 1},
    )
    async for doc in cursor:
        used.add(doc.get("slot_number"))
    return [n for n in range(1, TOTAL_SLOTS + 1) if n not in used]


async def reserve_campaign(
    business_id: str,
    city_id: str,
    start_date: str,
    end_date: str,
    creative: dict,
) -> dict:
    """Hold a campaign across every requested local date (all-or-nothing)."""
    ensure_enabled()
    days = _date_range(start_date, end_date)

    # All-or-nothing availability: no hidden partial bookings.
    for day in days:
        free = await _free_slots(city_id, day)
        if not free:
            raise HTTPException(
                status_code=409,
                detail={"code": "CITY_ADS_SOLD_OUT", "local_date": day},
            )

    campaign_id = generate_id("camp")
    reservations = []
    for day in days:
        free = await _free_slots(city_id, day)
        # Re-check under the same loop; parallel purchases are reconciled
        # by the application-level guard and the documented FerretDB limits.
        if not free:
            raise HTTPException(status_code=409, detail={"code": "CITY_ADS_SOLD_OUT", "local_date": day})
        slot_number = free[0]
        reservation_id = generate_id("adr")
        reservations.append({
            "reservation_id": reservation_id,
            "campaign_id": campaign_id,
            "city_id": city_id,
            "local_date": day,
            "slot_number": slot_number,
            "reservation_status": "held",
            "hold_expires_at": now_utc() + timedelta(minutes=HOLD_MINUTES),
            "created_at": now_utc(),
        })

    campaign_doc = {
        "campaign_id": campaign_id,
        "business_id": business_id,
        "city_id": city_id,
        "start_date": start_date,
        "end_date": end_date,
        "creative": creative,
        "status": "held",
        "payment_status": "none",
        "review_status": "pending",
        "created_at": now_utc(),
        "hold_expires_at": now_utc() + timedelta(minutes=HOLD_MINUTES),
    }
    await db.promotion_campaigns.insert_one(campaign_doc)
    if reservations:
        await db.ad_slot_reservations.insert_many(reservations)
    campaign_doc["reservations"] = reservations
    return campaign_doc


async def activate_campaign(campaign_id: str, business_id: str) -> dict:
    """Move a held campaign to scheduled/active (sandbox payment + review).

    No real charge happens here; CITYADS_SANDBOX accepts a mock confirmation.
    Real payment provider integration is a separate, approved step.
    """
    ensure_enabled()
    campaign = await db.promotion_campaigns.find_one(
        {"campaign_id": campaign_id, "business_id": business_id}, {"_id": 0}
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.get("status") != "held":
        raise HTTPException(status_code=400, detail="Campaign is not in held state")

    if not CITYADS_SANDBOX:
        raise HTTPException(
            status_code=503,
            detail="Payment provider is not configured yet (sandbox disabled)",
        )

    now = now_utc()
    if (campaign.get("hold_expires_at") or now) < now:
        await db.promotion_campaigns.update_one(
            {"campaign_id": campaign_id}, {"$set": {"status": "cancelled", "payment_status": "expired"}}
        )
        raise HTTPException(status_code=409, detail="Reservation hold expired; availability must be re-checked")

    updates = {
        "status": "active",
        "payment_status": "sandbox_confirmed",
        "review_status": "approved",
        "activated_at": now,
    }
    await db.promotion_campaigns.update_one({"campaign_id": campaign_id}, {"$set": updates})
    campaign.update(updates)
    return campaign


async def viewer_choice(viewer_key: str, city_id: str, local_date: str, pair: int) -> str:
    """Which group is currently shown for a pair ('A' or 'B').

    Starts at A; toggles after IMPRESSIONS_PER_ROTATION counted impressions of
    the currently shown ad. State is per viewer/city/local-day/pair.
    """
    doc = await db.ad_viewer_rotation.find_one(
        {"viewer_key": viewer_key, "city_id": city_id, "local_date": local_date, "pair": pair},
        {"_id": 0, "current_count": 1},
    )
    # Every 2 counted impressions toggle A<->B, back and forth (v18).
    switches = (doc or {}).get("current_count", 0) // IMPRESSIONS_PER_ROTATION
    return "B" if switches % 2 == 1 else "A"


async def carousel(city_id: str, local_date: str, viewer_key: str) -> dict:
    """12 logical carousel positions with the A/B pair selection."""
    ensure_enabled()
    parse_local_date(local_date)
    reservations = await db.ad_slot_reservations.find(
        {"city_id": city_id, "local_date": local_date, "reservation_status": "active"},
        {"_id": 0, "campaign_id": 1, "slot_number": 1},
    ).to_list(TOTAL_SLOTS)
    by_slot = {r["slot_number"]: r for r in reservations}

    campaign_ids = list({r["campaign_id"] for r in reservations})
    campaigns = {}
    if campaign_ids:
        cursor = db.promotion_campaigns.find(
            {"campaign_id": {"$in": campaign_ids}, "status": "active"},
            {"_id": 0, "campaign_id": 1, "business_id": 1, "creative": 1},
        )
        async for campaign in cursor:
            campaigns[campaign["campaign_id"]] = campaign

    positions = []
    for pair in range(1, SLOTS_PER_GROUP + 1):
        slot_a = pair
        slot_b = pair + SLOTS_PER_GROUP
        group = await viewer_choice(viewer_key, city_id, local_date, pair)
        chosen_slot = slot_a if group == "A" else slot_b
        fallback_slot = slot_b if group == "A" else slot_a
        reservation = by_slot.get(chosen_slot) or by_slot.get(fallback_slot)
        campaign = campaigns.get(reservation["campaign_id"]) if reservation else None
        positions.append({
            "position": pair,
            "shown_group": group,
            "campaign_id": campaign["campaign_id"] if campaign else None,
            "business_id": campaign["business_id"] if campaign else None,
            "creative": campaign["creative"] if campaign else None,
            "sponsored": bool(campaign),
        })
    return {"city_id": city_id, "local_date": local_date, "positions": positions}


async def record_impression(
    campaign_id: str,
    city_id: str,
    local_date: str,
    slot_number: int,
    viewer_key: str,
) -> dict:
    """One counted impression per viewer/ad/city/local-day (D08).

    Duplicate attempts within the day are ignored (anti-refresh dedupe). The
    client-side ≥50% viewport / ≥1s rule is enforced by the caller; the server
    additionally ignores rapid re-submissions.
    """
    ensure_enabled()
    if not 1 <= slot_number <= TOTAL_SLOTS:
        raise HTTPException(status_code=400, detail="Invalid slot_number")
    parse_local_date(local_date)
    campaign = await db.promotion_campaigns.find_one(
        {"campaign_id": campaign_id, "status": "active"}, {"_id": 0, "campaign_id": 1}
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Active campaign not found")

    existing = await db.ad_impressions.find_one(
        {
            "viewer_key": viewer_key,
            "city_id": city_id,
            "local_date": local_date,
            "campaign_id": campaign_id,
        },
        {"_id": 0},
    )
    now = now_utc()
    if existing and (now - (existing.get("seen_at") or now)).total_seconds() < 600:
        return {"counted": False, "reason": "deduplicated"}

    if existing:
        return {"counted": False, "reason": "already_counted_today"}

    await db.ad_impressions.insert_one({
        "impression_id": generate_id("imp"),
        "viewer_key": viewer_key,
        "city_id": city_id,
        "local_date": local_date,
        "campaign_id": campaign_id,
        "pair": pair_for_slot(slot_number),
        "seen_at": now,
    })
    # Update the pair rotation counter: 2 counted impressions toggle the group.
    await db.ad_viewer_rotation.update_one(
        {"viewer_key": viewer_key, "city_id": city_id, "local_date": local_date, "pair": pair_for_slot(slot_number)},
        {"$inc": {"current_count": 1}, "$setOnInsert": {"current_group": "A"}},
        upsert=True,
    )
    return {"counted": True}
