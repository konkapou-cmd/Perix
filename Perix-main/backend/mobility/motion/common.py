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


def directed_turn_caps(edges: list[dict], start_m: float, end_m: float,
                       rules: dict, window_m: float = 20.0) -> list[dict]:
    """Opt-in, fixed-distance bearings on the existing directed edge chain.

    The window is a geometric modeling criterion, not a measured road feature.
    Never bridge disconnected topology. Tiny polyline zigzags cancel over the
    window instead of becoming independent intersection turns.
    """
    if not math.isfinite(window_m) or window_m <= 0:
        return []

    def point(progress):
        for edge in edges:
            a, b = float(edge['from_m']), float(edge['to_m'])
            if a <= progress <= b and b > a:
                ratio = (progress - a) / (b - a)
                p, q = edge['from_point'], edge['to_point']
                return [p[i] + ratio * (q[i] - p[i]) for i in (0, 1)]
        return None

    out = []
    for index, (a, b) in enumerate(zip(edges, edges[1:])):
        p = float(a.get('to_m') or 0)
        if not start_m < p < end_m or a.get('to_node') is None or a.get('to_node') != b.get('from_node'):
            continue
        lo, hi = max(start_m, p - window_m), min(end_m, p + window_m)
        chain = [e for e in edges if e['to_m'] > lo and e['from_m'] < hi]
        if any(x.get('to_node') != y.get('from_node') or abs(x['to_m'] - y['from_m']) > .01
               for x, y in zip(chain, chain[1:])):
            continue
        try:
            before, center, after = point(lo), point(p), point(hi)
            if not before or not center or not after:
                continue
            angle = turn_angle_degrees({'from_point': before, 'to_point': center},
                                       {'from_point': center, 'to_point': after})
        except (KeyError, TypeError, ValueError):
            continue
        cap = turn_speed_cap_kmh(angle, rules)
        if cap is not None:
            out.append({'progress_m': p, 'speed_cap_kmh': cap, 'angle_deg': angle,
                        'from_edge_id': a.get('edge_id'), 'to_edge_id': b.get('edge_id'),
                        'kind': 'MODELED_TURN', 'window_m': window_m})
    return out


def refine_scenario_inputs(spans, edges, point_caps, scenario, config, start_m, end_m):
    """Pure opt-in input refinement; baseline builders never enter this path."""
    spans = [dict(s) for s in spans]
    for span in spans:
        edge = next((e for e in edges if str(e.get('edge_id')) == span.get('edge_id')), {})
        posted = (edge.get('way') or {}).get('maxspeed_kmh')
        valid = isinstance(posted, (int, float)) and not isinstance(posted, bool) and math.isfinite(posted) and posted > 0
        if valid:
            span['speed_cap_kmh'] = min(span['speed_cap_kmh'], posted, config['max_speed_kmh'])
        span['limit_basis'] = 'OSM_TAG' if valid else 'MODELED_DEFAULT'
        # Even an OSM tag is source evidence, not a legal certification.
        span['legal_limit_verified'] = False
        if span['edge_id'] in scenario.get('slow_edge_ids', []):
            span['speed_cap_kmh'] *= max(.1, min(1., scenario.get('speed_factor', 1.)))
    if scenario.get('refine_turns'):
        point_caps = directed_turn_caps(edges, start_m, end_m, config.get('turn_speed_kmh') or {},
                                        float(config.get('turn_window_m', 20.0)))
    return spans, point_caps


def _unique_positions(values: Iterable[float], epsilon: float = 0.001) -> list[float]:
    out = []
    for value in sorted(float(x) for x in values):
        if not out or abs(value - out[-1]) > epsilon:
            out.append(value)
    return out


def _cap_at(progress_m: float, spans: list[dict]) -> float:
    caps = []
    fallback = []
    for span in spans:
        speed = kmh_to_mps(float(span["speed_cap_kmh"]))
        speed = speed if math.isfinite(speed) and speed > 0.0 else 1e-9
        fallback.append(speed)
        if float(span["from_m"]) - 0.001 <= progress_m <= float(span["to_m"]) + 0.001:
            caps.append(speed)
    if caps:
        return min(caps)
    return min(fallback) if fallback else kmh_to_mps(10.0)


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
    initial_speed_mps: float = 0.0,
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

    initial_speed = min(
        caps[0],
        max(0.0, float(initial_speed_mps)),
    )
    caps[-1] = 0.0
    for i, p in enumerate(positions):
        if any(abs(p - sp) <= 0.001 for sp in stop_by_pos):
            caps[i] = 0.0

    speeds = [0.0 for _ in positions]
    speeds[0] = initial_speed
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

        if v0 + v1 > 0.0:
            phases = [(p0, p1, v0, v1, 2.0 * ds / (v0 + v1))]
        else:
            peak = math.sqrt(max(0.0, 2.0 * ds * accel * brake / (accel + brake)))
            cap = _cap_at((p0 + p1) / 2.0, spans)
            capped = cap < peak
            peak = min(peak, cap)
            accel_end = p0 + peak * peak / (2.0 * accel)
            phases = [(p0, accel_end, 0.0, peak, peak / accel)]
            brake_start = accel_end
            if capped:
                brake_start = max(accel_end, p1 - peak * peak / (2.0 * brake))
                phases.append((accel_end, brake_start, peak, peak, (brake_start - accel_end) / peak))
            phases.append((brake_start, p1, peak, 0.0, peak / brake))

        for phase_p0, phase_p1, phase_v0, phase_v1, dt in phases:
            segments.append(
                {
                    "t0": t,
                    "t1": t + dt,
                    "p0": phase_p0,
                    "p1": phase_p1,
                    "v0": phase_v0,
                    "v1": phase_v1,
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
        duration = t1 - t0
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
        if not (p0 <= target <= p1):
            continue

        x = _clamp(target - p0, 0.0, p1 - p0)
        t0 = float(segment["t0"])
        duration = float(segment["t1"]) - t0
        if duration <= 0.0:
            return t0
        v0 = float(segment.get("v0") or 0.0)
        v1 = float(segment.get("v1") or 0.0)
        a = (v1 - v0) / duration
        if a == 0.0:
            local = x / v0 if v0 > 0.0 else 0.0
        else:
            disc = max(0.0, v0 * v0 + 2.0 * a * x)
            # Rationalized kinematics avoids cancellation at very low speeds.
            denominator = v0 + math.sqrt(disc)
            local = 2.0 * x / denominator if denominator > 0.0 else 0.0
        return t0 + _clamp(local, 0.0, duration)
    return float(trajectory.get("duration_s") or 0.0)


def remaining_trajectory(trajectory: dict, elapsed_s: float, time_scale: float = 1.0) -> dict:
    """Clip an already legal plan at NOW without changing its position/speed.

    Used only by opt-in allocation when new traffic cannot justify a compatible
    mid-leg change. Reparameterize remaining phases; never rewrite past motion.
    """
    scale = max(1., float(time_scale))
    elapsed = max(0., elapsed_s / scale)
    segments, total = [], 0.
    for source in trajectory.get('segments', []):
        if source['t1'] <= elapsed:
            continue
        offset = max(0., elapsed - source['t0'])
        duration = source['t1'] - source['t0']
        acceleration = (source['v1'] - source['v0']) / duration if duration > 0 else 0.
        p0 = source['p0'] + source['v0'] * offset + .5 * acceleration * offset * offset
        dt = (source['t1'] - max(elapsed, source['t0'])) * scale
        segments.append({'t0':total,'t1':total+dt,'p0':p0,'p1':source['p1'],
            'v0':(source['v0']+acceleration*offset)/scale,'v1':source['v1']/scale,
            'state':source.get('state','MOVING'), **({'hold_id':source['hold_id']} if 'hold_id' in source else {})})
        total += dt
    return {'start_m':segments[0]['p0'] if segments else trajectory['end_m'],
            'end_m':trajectory['end_m'],'duration_s':total,'segments':segments,
            'model':trajectory.get('model'),'traffic_edge_count':trajectory.get('traffic_edge_count',0),
            'signal_stop_count':sum(s['state']!='MOVING' for s in segments)}
