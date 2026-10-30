"""Mongo-only public reads. Deliberately no write or external-provider calls."""
import json
from pathlib import Path
from fastapi import HTTPException
from public_services.models import PublicService

TAXONOMY = json.loads(Path(__file__).with_name("taxonomy.json").read_text(encoding="utf-8"))


def index_nodes(node, result=None):
    result = {} if result is None else result
    result[node["id"]] = node
    for child in node.get("children", []):
        index_nodes(child, result)
    return result


NODES = index_nodes(TAXONOMY)
PUBLIC_FIELDS = {field: 1 for field in PublicService.model_fields}
PUBLIC_FIELDS["_id"] = 0
PUBLIC_PREDICATE = {"entity_type": "public_service", "publication_status": "published",
                    "verification_status": "source_verified", "bio_status": "approved",
                    "is_hidden": {"$ne": True}, "is_deleted": {"$ne": True}}


def query_for(country_code, city_id, category_id=None, q=None, bounds=None, cursor=None, include_unlocated=False):
    query = {**PUBLIC_PREDICATE, "country_code": country_code, "city_id": city_id}
    if category_id:
        if category_id not in NODES:
            raise HTTPException(422, "Unknown public-services category")
        query["$or"] = [{field: category_id} for field in ("category_ids", "subcategory_ids", "leaf_category_ids")]
    if q:
        import re
        query["name"] = {"$regex": re.escape(q.strip()), "$options": "i"}
    if bounds:
        south, north, west, east = bounds
        if south >= north or west >= east or north - south > 1 or east - west > 2:
            raise HTTPException(422, "Invalid or oversized viewport")
        spatial = {"latitude": {"$gte": south, "$lte": north}, "longitude": {"$gte": west, "$lte": east}}
        if include_unlocated:
            query["$and"] = [{"$or": [spatial, {"latitude": None, "longitude": None}]}]
        else:
            query.update(spatial)
    if cursor:
        query["service_id"] = {"$gt": cursor}
    return query


async def list_public_services(collection, *, limit=50, **filters):
    query = query_for(**filters)
    docs = await collection.find(query, PUBLIC_FIELDS).sort("service_id", 1).limit(limit + 1).to_list(limit + 1)
    return {"items": [PublicService.model_validate(doc) for doc in docs[:limit]],
            "next_cursor": docs[limit - 1]["service_id"] if len(docs) > limit else None}


async def get_public_service(collection, service_id):
    doc = await collection.find_one({**PUBLIC_PREDICATE, "service_id": service_id}, PUBLIC_FIELDS)
    if doc is None:
        raise HTTPException(404, "Public service not found")
    return PublicService.model_validate(doc)
