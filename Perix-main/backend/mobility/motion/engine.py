"""Realtime-constrained bus/tram motion orchestration.

The engine never drives geometry and never invents route topology. It consumes:
- canonical path progress from routes.mobility,
- canonical edge/signal infrastructure from Phase 1,
- optional static traffic profiles,
- scheduled + GTFS-RT stop anchors.

Absolute lateness does not slow a vehicle. Only the stop-to-stop target duration
changes when delay changes between anchors.
"""
from __future__ import annotations

import hashlib
import time
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from database import db
from mobility.motion.bus import build_bus_leg
from mobility.motion.common import sample_trajectory
from mobility.motion.config import motion_config_for
from mobility.motion.traffic import traffic_snapshot_for_edges
from mobility.motion.tram import build_tram_leg
from mobility.regions import get_active_region

MOTION_SCHEMA_VERSION = 1
_PLAN_CACHE: dict = {}


def clear_motion_cache() -> None:
    _PLAN_CACHE.clear()


def _timeline_signature(timeline: list[dict]) -> str:
    parts = []
    for entry in timeline:
        parts.append(
            ":".join(
                [
                    str(entry.get("stop_id") or ""),
                    str(int(entry.get("predicted_arrival") or 0)),
                    str(int(entry.get("predicted_departure") or 0)),
                    str(entry.get("relationship") or ""),
                ]
            )
        )
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]


def _anchors(timeline: list[dict], stop_progress: list[float]) -> list[dict]:
    out = []
    for index, entry in enumerate(timeline):
        if index >= len(stop_progress):
            break
        if str(entry.get("relationship") or "SCHEDULED").upper() == "SKIPPED":
            continue
        out.append(
            {
                "timeline_index": index,
                "entry": entry,
                "progress_m": float(stop_progress[index]),
            }
        )
    return out


def _infra_matches_path(infra: dict, path: dict, config: dict) -> bool:
    infra_total = float(infra.get("total_m") or 0.0)
    path_total = float(path.get("total_m") or 0.0)
    if infra_total <= 0 or path_total <= 0:
        return False
    diff = abs(infra_total - path_total)
    tolerance = max(
        float(config["infrastructure_total_tolerance_m"]),
        path_total * float(config["infrastructure_total_tolerance_ratio"]),
    )
    return diff <= tolerance


def _fit_leg(builder, desired_duration_s: float, iterations: int) -> dict:
    """Fit soft traffic/signal delays without exceeding hard physical caps."""
    desired = max(1.0, float(desired_duration_s))
    natural = builder(0.0)
    natural_duration = float(natural.get("duration_s") or 0.0)
    if natural_duration <= 0:
        return {
            "trajectory": natural,
            "time_scale": 1.0,
            "physics_limited_s": 0.0,
            "fit": "EMPTY",
        }

    if desired >= natural_duration:
        return {
            "trajectory": natural,
            "time_scale": desired / natural_duration,
            "physics_limited_s": 0.0,
            "fit": "NATURAL_STRETCH",
        }

    fastest = builder(1.0)
    fastest_duration = float(fastest.get("duration_s") or natural_duration)
    if desired <= fastest_duration:
        return {
            "trajectory": fastest,
            "time_scale": 1.0,
            "physics_limited_s": max(0.0, fastest_duration - desired),
            "fit": "PHYSICS_LIMITED",
        }

    low, high = 0.0, 1.0
    best = fastest
    for _ in range(max(1, int(iterations))):
        mid = (low + high) / 2.0
        candidate = builder(mid)
        duration = float(candidate.get("duration_s") or 0.0)
        if duration > desired:
            low = mid
        else:
            best = candidate
            high = mid

    best_duration = max(0.001, float(best.get("duration_s") or 0.001))
    return {
        "trajectory": best,
        # Stretching is safe; compression is never used.
        "time_scale": max(1.0, desired / best_duration),
        "physics_limited_s": 0.0,
        "fit": "RECOVERY_BLEND",
    }


async def _build_trip_plan(
    *,
    trip_id: str,
    mode: str,
    version_id: str,
    timeline: list[dict],
    path: dict,
    now_local: datetime,
) -> Optional[dict]:
    region = get_active_region()
    config = motion_config_for(mode, region)
    pattern_id = str(path.get("pattern_id") or "")
    if not pattern_id or not version_id:
        return None

    infra = await db.mobility_pattern_infrastructure.find_one(
        {
            "pattern_id": pattern_id,
            "version_id": str(version_id),
            "region_id": region.region_id,
            "network_id": region.network_id,
        },
        {"_id": 0},
    )
    if not infra or not _infra_matches_path(infra, path, config):
        return None

    stop_progress = path.get("stop_progress") or []
    anchors = _anchors(timeline, stop_progress)
    if len(anchors) < 2:
        return None

    traffic_snapshot = {"provider": None, "profile_versions": [], "by_edge": {}}
    if str(mode) == "bus":
        traffic_snapshot = await traffic_snapshot_for_edges(
            infra.get("edges") or [],
            now_local,
            region_id=region.region_id,
            network_id=region.network_id,
        )
    traffic_by_edge = traffic_snapshot.get("by_edge") or {}

    trip_segments = []
    effective_arrival = float(anchors[0]["entry"]["predicted_arrival"])
    total_physics_limited = 0.0
    models = set()
    traffic_edges = 0
    signal_stops = 0

    for index in range(len(anchors) - 1):
        current = anchors[index]
        nxt = anchors[index + 1]
        current_entry = current["entry"]
        next_entry = nxt["entry"]

        predicted_departure = float(current_entry.get("predicted_departure") or effective_arrival)
        effective_departure = max(effective_arrival, predicted_departure)

        if effective_departure > effective_arrival:
            trip_segments.append(
                {
                    "kind": "DWELL",
                    "t0": effective_arrival,
                    "t1": effective_departure,
                    "progress_m": float(current["progress_m"]),
                    "timeline_index": int(current["timeline_index"]),
                    "next_timeline_index": int(current["timeline_index"]),
                }
            )

        desired_arrival = float(next_entry.get("predicted_arrival") or effective_departure + 1.0)
        desired_duration = max(1.0, desired_arrival - effective_departure)

        scheduled_departure = float(
            current_entry.get("scheduled_departure")
            or current_entry.get("scheduled")
            or predicted_departure
        )
        scheduled_arrival = float(
            next_entry.get("scheduled_arrival")
            or next_entry.get("scheduled")
            or desired_arrival
        )
        scheduled_duration = max(1.0, scheduled_arrival - scheduled_departure)
        delay_delta = int(next_entry.get("delay_seconds") or 0) - int(
            current_entry.get("delay_seconds") or 0
        )

        if str(mode) == "tram":
            def builder(recovery_ratio: float):
                return build_tram_leg(
                    edges=infra.get("edges") or [],
                    signals=infra.get("signals") or [],
                    start_m=float(current["progress_m"]),
                    end_m=float(nxt["progress_m"]),
                    departure_service_s=effective_departure,
                    config=config,
                    recovery_ratio=recovery_ratio,
                )
        else:
            def builder(recovery_ratio: float):
                return build_bus_leg(
                    edges=infra.get("edges") or [],
                    signals=infra.get("signals") or [],
                    traffic_by_edge=traffic_by_edge,
                    start_m=float(current["progress_m"]),
                    end_m=float(nxt["progress_m"]),
                    departure_service_s=effective_departure,
                    config=config,
                    recovery_ratio=recovery_ratio,
                )

        fitted = _fit_leg(
            builder,
            desired_duration,
            int(config["calibration_iterations"]),
        )
        trajectory = fitted["trajectory"]
        duration = float(trajectory.get("duration_s") or 0.0) * float(fitted["time_scale"])
        if duration <= 0:
            return None

        effective_next_arrival = effective_departure + duration
        physics_limited = float(fitted.get("physics_limited_s") or 0.0)
        total_physics_limited += physics_limited
        models.add(str(trajectory.get("model") or ""))
        traffic_edges += int(trajectory.get("traffic_edge_count") or 0)
        signal_stops += int(trajectory.get("signal_stop_count") or 0)

        trip_segments.append(
            {
                "kind": "MOVE",
                "t0": effective_departure,
                "t1": effective_next_arrival,
                "trajectory": trajectory,
                "time_scale": float(fitted["time_scale"]),
                "from_timeline_index": int(current["timeline_index"]),
                "next_timeline_index": int(nxt["timeline_index"]),
                "requested_duration_s": round(desired_duration, 3),
                "scheduled_duration_s": round(scheduled_duration, 3),
                "delay_delta_s": delay_delta,
                "physics_limited_s": round(physics_limited, 3),
                "fit": fitted.get("fit"),
            }
        )
        effective_arrival = effective_next_arrival

    final = anchors[-1]
    final_departure = max(
        effective_arrival,
        float(final["entry"].get("predicted_departure") or effective_arrival),
    )
    if final_departure > effective_arrival:
        trip_segments.append(
            {
                "kind": "DWELL",
                "t0": effective_arrival,
                "t1": final_departure,
                "progress_m": float(final["progress_m"]),
                "timeline_index": int(final["timeline_index"]),
                "next_timeline_index": int(final["timeline_index"]),
            }
        )

    return {
        "schema_v": MOTION_SCHEMA_VERSION,
        "trip_id": str(trip_id),
        "pattern_id": pattern_id,
        "mode": str(mode),
        "segments": trip_segments,
        "start_s": float(trip_segments[0]["t0"]) if trip_segments else effective_arrival,
        "end_s": float(trip_segments[-1]["t1"]) if trip_segments else final_departure,
        "traffic_edge_count": traffic_edges,
        "signal_stop_count": signal_stops,
        "physics_limited_s": round(total_physics_limited, 3),
        "motion_model": next(iter(models)) if len(models) == 1 else "+".join(sorted(x for x in models if x)),
        "motion_quality": "PHYSICS_TRAFFIC" if traffic_edges else "PHYSICS_BASELINE",
        "traffic_provider": traffic_snapshot.get("provider"),
        "traffic_profile_versions": traffic_snapshot.get("profile_versions") or [],
    }


def _sample_trip_plan(plan: dict, now_sec: float, timeline: list[dict], stop_progress: list[float]) -> dict:
    segments = plan.get("segments") or []
    if not segments:
        return {}

    now_value = float(now_sec)
    if now_value <= float(segments[0]["t0"]):
        first_index = int(
            segments[0].get("from_timeline_index")
            or segments[0].get("timeline_index")
            or 0
        )
        return {
            "progress_m": float(stop_progress[first_index]),
            "speed_kmh": 0.0,
            "motion_state": "AT_STOP",
            "next_timeline_index": first_index,
        }

    selected = None
    for segment in segments:
        if float(segment["t0"]) <= now_value <= float(segment["t1"]):
            selected = segment
            break
    if selected is None:
        last_index = int(
            segments[-1].get("next_timeline_index")
            or segments[-1].get("timeline_index")
            or (len(timeline) - 1)
        )
        return {
            "progress_m": float(stop_progress[last_index]),
            "speed_kmh": 0.0,
            "motion_state": "AT_STOP",
            "next_timeline_index": last_index,
        }

    if selected["kind"] == "DWELL":
        index = int(selected["timeline_index"])
        return {
            "progress_m": float(selected["progress_m"]),
            "speed_kmh": 0.0,
            "motion_state": "DWELL",
            "next_timeline_index": index,
            "delay_delta_s": 0,
            "physics_limited_s": 0.0,
        }

    sample = sample_trajectory(
        selected["trajectory"],
        now_value - float(selected["t0"]),
        float(selected.get("time_scale") or 1.0),
    )
    return {
        "progress_m": float(sample["progress_m"]),
        "speed_kmh": round(float(sample["speed_kmh"]), 2),
        "motion_state": str(sample.get("state") or "MOVING"),
        "next_timeline_index": int(selected["next_timeline_index"]),
        "delay_delta_s": int(selected.get("delay_delta_s") or 0),
        "physics_limited_s": round(float(selected.get("physics_limited_s") or 0.0), 2),
        "fit": selected.get("fit"),
    }


async def position_for_trip(
    *,
    trip_id: str,
    mode: str,
    version_id: str,
    timeline: list[dict],
    path: dict,
    now_sec: int,
) -> Optional[dict]:
    """Return a physics-derived progress position, or None for legacy fallback."""
    region = get_active_region()
    config = motion_config_for(mode, region)
    now_local = datetime.now(ZoneInfo(region.timezone))
    traffic_bucket = f"{now_local.date().isoformat()}:{now_local.hour:02d}:{now_local.minute // 15}"
    key = (
        region.region_id,
        region.network_id,
        str(version_id),
        str(path.get("pattern_id") or ""),
        str(trip_id),
        _timeline_signature(timeline),
        traffic_bucket,
    )

    now_mono = time.monotonic()
    cached = _PLAN_CACHE.get(key)
    if cached and now_mono - float(cached.get("cached_at") or 0.0) <= float(config["plan_cache_seconds"]):
        plan = cached["plan"]
    else:
        plan = await _build_trip_plan(
            trip_id=str(trip_id),
            mode=str(mode),
            version_id=str(version_id),
            timeline=timeline,
            path=path,
            now_local=now_local,
        )
        if not plan:
            return None
        for stale_key, stale_value in list(_PLAN_CACHE.items()):
            if now_mono - float(stale_value.get("cached_at") or 0.0) > 60.0:
                _PLAN_CACHE.pop(stale_key, None)
        _PLAN_CACHE[key] = {"cached_at": now_mono, "plan": plan}

    stop_progress = path.get("stop_progress") or []
    sampled = _sample_trip_plan(plan, now_sec, timeline, stop_progress)
    if not sampled:
        return None

    next_index = max(0, min(len(timeline) - 1, int(sampled["next_timeline_index"])))
    next_entry = timeline[next_index]
    progress = max(0.0, min(float(path.get("total_m") or 0.0), float(sampled["progress_m"])))
    next_progress = float(stop_progress[next_index]) if next_index < len(stop_progress) else progress

    return {
        **sampled,
        "progress_m": progress,
        "next_timeline_index": next_index,
        "next_stop_id": next_entry.get("stop_id"),
        "next_stop_name": next_entry.get("name") or (next_entry.get("stop") or {}).get("name"),
        "distance_to_next_stop_m": max(0.0, next_progress - progress),
        "motion_model": plan.get("motion_model"),
        "motion_quality": plan.get("motion_quality"),
        "traffic_edge_count": int(plan.get("traffic_edge_count") or 0),
        "signal_stop_count": int(plan.get("signal_stop_count") or 0),
        "traffic_provider": plan.get("traffic_provider"),
        "traffic_profile_versions": plan.get("traffic_profile_versions") or [],
    }
