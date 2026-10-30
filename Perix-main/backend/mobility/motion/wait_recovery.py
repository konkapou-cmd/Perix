"""Opt-in ETA reconciliation by removing waits, never by speeding up movement.

Only the current leg/current station can release a wait. Future legal MOVE
profiles are shifted, not refitted. No arrival/passage is inferred from an ETA.
"""
from __future__ import annotations

from copy import deepcopy
import math
import os

from mobility.motion.diagnostics import lateness_flow

MAX_SOURCE_AGE_S = 90.0
MIN_GAIN_S = 2.0


def enabled() -> bool:
    return os.getenv("MOBILITY_WAIT_ONLY_RECOVERY_ENABLED", "false").lower() == "true"


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


def _raw(entry, field):
    return _number(entry.get("raw_" + field, entry.get(field)))


def _fresh_explicit(old, new, field, now_epoch):
    evidence = new.get("motion_prediction") or {}
    prior = old.get("motion_prediction") or {}
    stamp = _number(evidence.get("source_timestamp"))
    previous_stamp = _number(prior.get("source_timestamp")) or 0.0
    return (evidence.get("source") == "GTFS_RT"
            and evidence.get(field + "_explicit") is True
            and stamp is not None and stamp > previous_stamp
            and 0.0 <= now_epoch - stamp <= MAX_SOURCE_AGE_S
            and new.get("relationship", "SCHEDULED") == "SCHEDULED")


def _same_topology(old, new):
    # Current upstream RT storage is keyed by stop_id, not occurrence. Do not
    # use this policy on loops with repeated stop IDs until RT is occurrence-safe.
    ids = [entry.get("stop_id") for entry in new]
    if len(old) != len(new) or len(set(ids)) != len(ids):
        return False
    fields = ("stop_id", "stop_sequence", "relationship",
              "scheduled_arrival", "scheduled_departure")
    return all(all(a.get(k) == b.get(k) for k in fields) for a, b in zip(old, new))


def _trim_signal_waits(trajectory, *, elapsed_s, budget_s, time_scale):
    """Keep every MOVING phase and every already elapsed instant unchanged."""
    result = deepcopy(trajectory)
    removed = 0.0
    for source, segment in zip(trajectory["segments"], result["segments"]):
        available = max(0.0, float(source["t1"]) - max(elapsed_s, float(source["t0"])))
        stationary = (source.get("state") == "SIGNAL_HOLD"
                      and source["p0"] == source["p1"]
                      and source.get("v0") == source.get("v1") == 0.0)
        cut = min(available, max(0.0, budget_s / time_scale - removed)) if stationary else 0.0
        segment["t0"] = float(source["t0"]) - removed
        segment["t1"] = float(source["t1"]) - removed - cut
        removed += cut
    result["segments"] = [s for s in result["segments"] if s["t1"] > s["t0"]]
    result["duration_s"] = float(trajectory["duration_s"]) - removed
    result["signal_stop_count"] = sum(s.get("state") == "SIGNAL_HOLD" for s in result["segments"])
    return result, removed * time_scale


def reconcile_waits(previous_plan, timeline, *, now_s, now_epoch, departure_floor_s=None):
    """Return a wait-only replacement, or None for incompatible plan topology.

    Caller must already enforce identical trip/day/version/geometry identity,
    recent cached ownership, and baseline (non-provider) context. Untrusted,
    repeated or unchanged forecasts retain the existing motion profile. Fresh
    later constraints are left to the existing planner, not silently ignored.
    """
    old_timeline = previous_plan.get("effective_timeline") or []
    if previous_plan.get("traffic_provider") not in (None, "STATIC_PROFILE_V1"):
        return None
    if previous_plan.get("traffic_expires_at") is not None and now_epoch >= previous_plan["traffic_expires_at"]:
        return None
    if not _same_topology(old_timeline, timeline):
        return None
    if any(_raw(e, f) is None for e in timeline
           for f in ("predicted_arrival", "predicted_departure")):
        return None
    if any(_raw(e, "predicted_departure") < _raw(e, "predicted_arrival") for e in timeline):
        return None
    segments = previous_plan.get("segments") or []
    active_index = next((i for i, s in enumerate(segments)
                         if s["t0"] <= now_s < s["t1"]), None)
    if active_index is None:
        return None
    active_origin = int(segments[active_index].get("next_timeline_index",
                                                 segments[active_index].get("timeline_index", 0)))
    for old, new in zip(old_timeline[active_origin:], timeline[active_origin:]):
        for event in ("arrival", "departure"):
            if (_fresh_explicit(old, new, event, now_epoch)
                    and _raw(new, "predicted_" + event) > _raw(old, "predicted_" + event)):
                return None
    plan = deepcopy(previous_plan)
    active = plan["segments"][active_index]
    target_index = int(active.get("next_timeline_index", active.get("timeline_index", 0)))
    old, new = old_timeline[target_index], timeline[target_index]
    field = "arrival" if active["kind"] == "MOVE" else "departure"
    clock_field = "predicted_" + field
    gain = max(0.0, (_raw(old, clock_field) or 0.0) - _raw(new, clock_field))
    accepted = _fresh_explicit(old, new, field, now_epoch)
    removed = 0.0
    if accepted and gain >= MIN_GAIN_S:
        budget = min(gain, max(0.0, active["t1"] - _raw(new, clock_field)))
        if active["kind"] == "MOVE":
            scale = max(1.0, float(active.get("time_scale") or 1.0))
            active["trajectory"], removed = _trim_signal_waits(
                active["trajectory"], elapsed_s=(now_s - active["t0"]) / scale,
                budget_s=budget, time_scale=scale,
            )
        elif active["kind"] == "DWELL":
            # Do not restart service from NOW and do not waive a timetable hold.
            service = max(0.0,
                          float(new.get("scheduled_departure", 0)) - float(new.get("scheduled_arrival", 0)),
                          _raw(new, "predicted_departure") - _raw(new, "predicted_arrival"))
            floor = max(now_s, active["t0"] + service,
                        float(new.get("scheduled_departure", active["t0"])))
            if departure_floor_s is not None and target_index == 0:
                floor = max(floor, float(departure_floor_s))
            removed = min(budget, max(0.0, active["t1"] - floor))
        active["t1"] -= removed

    # Move the remaining legal motion profiles earlier by the released wait.
    # Future dwell may absorb this gain at a mandatory scheduled departure.
    advance = removed
    for i in range(active_index + 1, len(segments)):
        source, segment = segments[i], plan["segments"][i]
        segment["t0"] = float(source["t0"]) - advance
        segment["t1"] = float(source["t1"]) - advance
        if segment["kind"] == "DWELL":
            index = int(segment["timeline_index"])
            entry, prior = timeline[index], old_timeline[index]
            service = max(0.0, float(entry.get("scheduled_departure", 0))
                          - float(entry.get("scheduled_arrival", 0)))
            if (_fresh_explicit(prior, entry, "arrival", now_epoch)
                    and _fresh_explicit(prior, entry, "departure", now_epoch)):
                service = max(service, _raw(entry, "predicted_departure") - _raw(entry, "predicted_arrival"))
            floor = (max(float(entry.get("scheduled_departure", segment["t1"])),
                         _raw(entry, "predicted_departure"))
                     if _fresh_explicit(prior, entry, "departure", now_epoch)
                     else float(entry.get("scheduled_departure", segment["t1"])))
            segment["t1"] = max(segment["t1"], floor, segment["t0"] + service)
            advance = float(source["t1"]) - segment["t1"]

    # Accept only fresh explicit clocks as targets. A propagated ETA is not a
    # release authorization; a poll timestamp is not a source observation.
    for old_entry, entry, incoming in zip(old_timeline, plan["effective_timeline"], timeline):
        for event in ("arrival", "departure"):
            if _fresh_explicit(old_entry, incoming, event, now_epoch):
                entry["raw_predicted_" + event] = _raw(incoming, "predicted_" + event)
                entry["motion_prediction"] = deepcopy(incoming["motion_prediction"])
    for i, segment in enumerate(plan["segments"]):
        if i < active_index:
            continue
        if segment["kind"] == "MOVE":
            index = int(segment["next_timeline_index"])
            entry = plan["effective_timeline"][index]
            arrival_advance = entry["predicted_arrival"] - segment["t1"]
            entry["predicted_arrival"] = segment["t1"]
            entry["predicted_departure"] = max(entry["predicted_arrival"], entry["predicted_departure"] - arrival_advance)
            origin = plan["effective_timeline"][int(segment["from_timeline_index"])]
            origin["predicted_departure"] = segment["t0"]
        else:
            index = int(segment["timeline_index"])
            entry = plan["effective_timeline"][index]
            entry["predicted_departure"] = segment["t1"]
        error = max(0.0, entry["predicted_arrival"] - _raw(entry, "predicted_arrival"))
        segment.update(fit="WAIT_ONLY", arrival_target_error_s=error, physics_limited_s=error)
        if segment["kind"] == "MOVE":
            segment.update(lateness_flow(
                predicted_departure_s=_raw(origin, "predicted_departure"),
                effective_departure_s=segment["t0"],
                predicted_arrival_s=_raw(entry, "predicted_arrival"),
                effective_arrival_s=segment["t1"],
            ))
            segment.update(requested_duration_s=_raw(entry, "predicted_arrival") - segment["t0"],
                           natural_duration_s=None, fastest_duration_s=None)
        else:
            segment.update(carried_lateness_s=error, incremental_physics_limited_s=0.0,
                           recovered_lateness_s=0.0)
    for entry in plan["effective_timeline"]:
        if entry.get("scheduled_arrival") is not None:
            entry["delay_seconds"] = entry["predicted_arrival"] - entry["scheduled_arrival"]
    errors = [max(0.0, e["predicted_arrival"] - _raw(e, "predicted_arrival"))
              for e in plan["effective_timeline"]]
    plan.update(end_s=plan["segments"][-1]["t1"], physics_limited_s=errors[-1],
                final_arrival_target_error_s=errors[-1], max_arrival_target_error_s=max(errors),
                incremental_physics_limited_s=sum(s.get("incremental_physics_limited_s", 0.0) for s in plan["segments"]),
                recovered_lateness_s=sum(s.get("recovered_lateness_s", 0.0) for s in plan["segments"]),
                wait_only_recovery={"policy": "WAIT_ONLY_V1", "released_wait_s": removed,
                                    "arrival_advance_at_end_s": previous_plan["end_s"] - plan["segments"][-1]["t1"],
                                    "source_accepted": bool(accepted), "requested_gain_s": gain,
                                    "speed_profile_changed": False, "passage_inferred": False})
    plan["signal_stop_count"] = sum((s.get("trajectory") or {}).get("signal_stop_count", 0)
                                     for s in plan["segments"] if s["kind"] == "MOVE")
    return plan
