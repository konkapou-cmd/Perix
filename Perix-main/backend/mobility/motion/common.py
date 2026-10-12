"""Pure trajectory mathematics shared by bus and tram motion models."""
from __future__ import annotations

import hashlib
import math
from typing import Iterable, Optional


def kmh_to_mps(value: float) -> float:
    return max(0.0, float(value)) / 3.6


def mps_to_kmh(value: float) -> float:
    return max(0.0, float(value)) * 3.6


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def stable_phase_offset(identifier, cycle_s: float) -> float:
    """Stable pseudo-phase used only when a region has no live signal phase."""
    cycle = max(1.0, float(cycle_s))
    digest = hashlib.sha1(str(identifier).encode("utf-8")).digest()
    raw = int.from_bytes(digest[:8], "big", signed=False)
    return float(raw % max(1, int(round(cycle))))


def deterministic_signal_hold_seconds(
    identifier,
    arrival_service_s: float,
    *,
    cycle_s: float,
    green_ratio: float,
    max_hold_s: float,
) -> float:
    """Deterministic red-phase wait.

    This is a modeled fallback, not a claim about the real controller phase.
    Region-specific calibrated values may override the defaults.
    """
    cycle = max(1.0, float(cycle_s))
    green_ratio = _clamp(float(green_ratio), 0.05, 0.95)
    green_s = cycle * green_ratio
    phase = (float(arrival_service_s) + stable_phase_offset(identifier, cycle)) % cycle
    if phase < green_s:
        return 0.0
    return min(max(0.0, float(max_hold_s)), cycle - phase)


def _bearing_deg(a: list, b: list) -> float:
    lat1, lng1 = math.radians(float(a[0])), math.radians(float(a[1]))
    lat2, lng2 = math.radians(float(b[0])), math.radians(float(b[1]))
    dlng = lng2 - lng1
    y = math.sin(dlng) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlng)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def turn_angle_degrees(edge_a: dict, edge_b: dict) -> float:
    """Smallest heading change between two consecutive directed edges."""
    try:
        h1 = _bearing_deg(edge_a["from_point"], edge_a["to_point"])
        h2 = _bearing_deg(edge_b["from_point"], edge_b["to_point"])
    except Exception:
        return 0.0
    delta = abs(h2 - h1) % 360.0
    return min(delta, 360.0 - delta)


def turn_speed_cap_kmh(angle_deg: float, rules: dict) -> Optional[float]:
    """Apply the strictest configured cap whose angle threshold is exceeded."""
    selected = None
    for raw_threshold, raw_speed in sorted(
        ((float(k), float(v)) for k, v in (rules or {}).items()),
        key=lambda x: x[0],
    ):
        if float(angle_deg) >= raw_threshold:
            selected = raw_speed
    return selected


def _unique_positions(values: Iterable[float], epsilon: float = 0.001) -> list[float]:
    out = []
    for value in sorted(float(x) for x in values):
        if not out or abs(value - out[-1]) > epsilon:
            out.append(value)
    return out


def _cap_at(progress_m: float, spans: list[dict]) -> float:
    caps = []
    for span in spans:
        if float(span["from_m"]) - 0.001 <= progress_m <= float(span["to_m"]) + 0.001:
            caps.append(kmh_to_mps(float(span["speed_cap_kmh"])))
    if caps:
        return max(0.1, min(caps))
    fallback = [kmh_to_mps(float(x["speed_cap_kmh"])) for x in spans]
    return max(0.1, min(fallback)) if fallback else kmh_to_mps(10.0)


def build_speed_trajectory(
    *,
    start_m: float,
    end_m: float,
    spans: list[dict],
    point_speed_caps: Optional[list[dict]] = None,
    mandatory_stops: Optional[list[dict]] = None,
    acceleration_mps2: float,
    braking_mps2: float,
    step_m: float = 5.0,
) -> dict:
    """Build a forward-only speed envelope and time/progress trajectory.

    Speed limits are enforced spatially. A forward pass enforces acceleration,
    a backward pass enforces braking, and mandatory stops insert zero-speed
    constraints plus explicit hold intervals.
    """
    start = float(start_m)
    end = float(end_m)
    if end <= start:
        return {
            "start_m": start,
            "end_m": end,
            "duration_s": 0.0,
            "segments": [],
        }

    accel = max(0.05, float(acceleration_mps2))
    brake = max(0.05, float(braking_mps2))
    step = max(1.0, float(step_m))
    point_speed_caps = point_speed_caps or []
    mandatory_stops = mandatory_stops or []

    positions = {start, end}
    for span in spans:
        a = max(start, float(span["from_m"]))
        b = min(end, float(span["to_m"]))
        if b > a:
            positions.add(a)
            positions.add(b)
    for item in point_speed_caps:
        p = float(item.get("progress_m", start))
        if start < p < end:
            positions.add(p)
    for item in mandatory_stops:
        p = float(item.get("progress_m", start))
        if start < p < end:
            positions.add(p)

    cursor = start + step
    while cursor < end:
        positions.add(cursor)
        cursor += step

    positions = _unique_positions(positions)
    caps = [_cap_at(p, spans) for p in positions]

    for i, p in enumerate(positions):
        for item in point_speed_caps:
            if abs(p - float(item.get("progress_m", p + 1.0))) <= 0.001:
                caps[i] = min(caps[i], kmh_to_mps(float(item["speed_cap_kmh"])))

    stop_by_pos = {}
    for item in mandatory_stops:
        p = float(item.get("progress_m", start))
        if not (start < p < end):
            continue
        stop_by_pos[p] = {
            "hold_s": max(0.0, float(item.get("hold_s") or 0.0)),
            "state": str(item.get("state") or "HOLD"),
            "id": item.get("id"),
        }

    caps[0] = 0.0
    caps[-1] = 0.0
    for i, p in enumerate(positions):
        if any(abs(p - sp) <= 0.001 for sp in stop_by_pos):
            caps[i] = 0.0

    speeds = [0.0 for _ in positions]
    for i in range(1, len(positions)):
        ds = max(0.0, positions[i] - positions[i - 1])
        reachable = math.sqrt(max(0.0, speeds[i - 1] ** 2 + 2.0 * accel * ds))
        speeds[i] = min(caps[i], reachable)

    speeds[-1] = 0.0
    for i in range(len(positions) - 2, -1, -1):
        ds = max(0.0, positions[i + 1] - positions[i])
        allowed = math.sqrt(max(0.0, speeds[i + 1] ** 2 + 2.0 * brake * ds))
        speeds[i] = min(speeds[i], caps[i], allowed)

    segments = []
    t = 0.0
    for i in range(len(positions) - 1):
        p0, p1 = positions[i], positions[i + 1]
        ds = max(0.0, p1 - p0)
        v0, v1 = speeds[i], speeds[i + 1]
        if ds <= 0.0:
            continue

        if v0 + v1 > 0.05:
            dt = 2.0 * ds / max(0.05, v0 + v1)
        else:
            peak = math.sqrt(max(0.0, 2.0 * ds * accel * brake / (accel + brake)))
            dt = peak / accel + peak / brake

        segments.append(
            {
                "t0": t,
                "t1": t + dt,
                "p0": p0,
                "p1": p1,
                "v0": v0,
                "v1": v1,
                "state": "MOVING",
            }
        )
        t += dt

        stop = next(
            (value for sp, value in stop_by_pos.items() if abs(sp - p1) <= 0.001),
            None,
        )
        if stop and stop["hold_s"] > 0:
            segments.append(
                {
                    "t0": t,
                    "t1": t + stop["hold_s"],
                    "p0": p1,
                    "p1": p1,
                    "v0": 0.0,
                    "v1": 0.0,
                    "state": stop["state"],
                    "hold_id": stop.get("id"),
                }
            )
            t += stop["hold_s"]

    return {
        "start_m": start,
        "end_m": end,
        "duration_s": t,
        "segments": segments,
    }


def sample_trajectory(trajectory: dict, elapsed_s: float, time_scale: float = 1.0) -> dict:
    """Sample progress/speed without ever compressing a trajectory faster."""
    scale = max(1.0, float(time_scale))
    elapsed = max(0.0, float(elapsed_s)) / scale
    segments = trajectory.get("segments") or []

    if not segments:
        return {
            "progress_m": float(trajectory.get("end_m") or trajectory.get("start_m") or 0.0),
            "speed_kmh": 0.0,
            "state": "AT_STOP",
        }

    for segment in segments:
        if elapsed > float(segment["t1"]):
            continue
        t0 = float(segment["t0"])
        t1 = float(segment["t1"])
        p0 = float(segment["p0"])
        p1 = float(segment["p1"])
        state = str(segment.get("state") or "MOVING")
        if p1 == p0 or t1 <= t0:
            return {"progress_m": p0, "speed_kmh": 0.0, "state": state}

        local_t = _clamp(elapsed - t0, 0.0, t1 - t0)
        duration = max(0.001, t1 - t0)
        v0 = float(segment.get("v0") or 0.0)
        v1 = float(segment.get("v1") or 0.0)
        accel = (v1 - v0) / duration
        distance = v0 * local_t + 0.5 * accel * local_t * local_t
        progress = _clamp(p0 + distance, p0, p1)
        speed = max(0.0, v0 + accel * local_t) / scale
        return {
            "progress_m": progress,
            "speed_kmh": mps_to_kmh(speed),
            "state": state,
        }

    return {
        "progress_m": float(trajectory.get("end_m") or 0.0),
        "speed_kmh": 0.0,
        "state": "AT_STOP",
    }


def trajectory_time_at_progress(trajectory: dict, progress_m: float) -> float:
    """First arrival time at progress_m inside an unscaled trajectory."""
    target = float(progress_m)
    for segment in trajectory.get("segments") or []:
        p0 = float(segment["p0"])
        p1 = float(segment["p1"])
        if p1 == p0:
            if abs(target - p0) <= 0.001:
                return float(segment["t0"])
            continue
        if not (p0 - 0.001 <= target <= p1 + 0.001):
            continue

        x = _clamp(target - p0, 0.0, p1 - p0)
        t0 = float(segment["t0"])
        duration = max(0.001, float(segment["t1"]) - t0)
        v0 = float(segment.get("v0") or 0.0)
        v1 = float(segment.get("v1") or 0.0)
        a = (v1 - v0) / duration
        if abs(a) < 1e-9:
            local = x / max(0.001, v0)
        else:
            disc = max(0.0, v0 * v0 + 2.0 * a * x)
            roots = [(-v0 + math.sqrt(disc)) / a, (-v0 - math.sqrt(disc)) / a]
            valid = [r for r in roots if -0.001 <= r <= duration + 0.001]
            local = min(valid) if valid else duration * (x / max(0.001, p1 - p0))
        return t0 + _clamp(local, 0.0, duration)
    return float(trajectory.get("duration_s") or 0.0)
