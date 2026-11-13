"""Validate already-reviewed directory documents without promoting review states."""
import hashlib
import math
from pathlib import Path

from public_services.models import PublicService
from public_services.repository import NODES


APPROVALS = {
    "publication_status": "published",
    "verification_status": "source_verified",
    "bio_status": "approved",
    "publication_rights_status": "approved",
    "coordinate_review_status": "approved",
}


def approved_records(records, *, assets_root: Path):
    """Select only explicitly approved records; fail closed on invalid approved data."""
    selected, excluded, seen = [], [], set()
    for record in records:
        source_id = record.get("source_record_id")
        service_id = record.get("service_id")
        if not source_id or not service_id or service_id in seen:
            raise ValueError("Missing or duplicate public-service identity")
        seen.add(service_id)
        expected = "ps_" + hashlib.sha256(source_id.encode()).hexdigest()[:24]
        if service_id != expected:
            raise ValueError(f"Unstable service identity: {source_id}")
        if not all(record.get(key) == value for key, value in APPROVALS.items()):
            excluded.append(service_id)
            continue
        PublicService.model_validate(record)
        if record.get("is_hidden") or record.get("is_deleted"):
            raise ValueError(f"Approved record is hidden/deleted: {source_id}")
        if record.get("country_code") == "GR":
            if record.get("city_id") not in ("gr-acharnes", "gr-agioi-anargyroi", "gr-syros", "gr-mykonos"):
                raise ValueError(f"Unexpected import scope: {source_id}")
        elif record.get("country_code") != "DE" or record.get("city_id") not in ("de-magdeburg", "de-gardelegen"):
            raise ValueError(f"Unexpected import scope: {source_id}")
        if record.get("category_ids") != ["public-services"] or not record.get("subcategory_ids"):
            raise ValueError(f"Missing canonical categories: {source_id}")
        for key in ("category_ids", "subcategory_ids", "leaf_category_ids"):
            if any(category not in NODES for category in record.get(key, [])):
                raise ValueError(f"Unknown category: {source_id}")
        for key in ("latitude", "longitude"):
            value = record.get(key)
            if value is None or not math.isfinite(value):
                raise ValueError(f"Missing approved coordinates: {source_id}")
        for key, folder in (("profile_image_asset", "profiles"), ("cover_image_asset", "covers")):
            value = record.get(key)
            path = Path(value or "")
            if not value or path.is_absolute() or ".." in path.parts or path.parts[0] != folder:
                raise ValueError(f"Unsafe image asset: {source_id}")
            if not (assets_root / path).is_file():
                raise ValueError(f"Missing image asset: {source_id}")
        if not all(record.get(f"description_{language}") for language in ("el", "de", "en")):
            raise ValueError(f"Missing multilingual description: {source_id}")
        selected.append(dict(record))
    return selected, excluded
