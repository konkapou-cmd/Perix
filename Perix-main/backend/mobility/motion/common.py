"""Pure trajectory mathematics shared by bus and tram motion models."""
from __future__ import annotations

import hashlib
import heapq
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


def directed_turn_caps(edges, start_m, end_m, rules, window_m=20.0):
    """Existing WIP fixed-distance bearing refinement, used only for soft priors.

    Original hard turn constraints remain in place. Never bridge topology gaps.
    """
    def point(progress):
        for edge in edges:
            a, b = float(edge['from_m']), float(edge['to_m'])
            if a <= progress <= b and b > a:
                ratio = (progress - a) / (b - a)
                p, q = edge['from_point'], edge['to_point']
                return [p[i] + ratio * (q[i] - p[i]) for i in (0, 1)]
        return None
    out = []
    for a, b in zip(edges, edges[1:]):
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
            angle = turn_angle_degrees({'from_point':before,'to_point':center},
                                       {'from_point':center,'to_point':after})
        except (KeyError, TypeError, ValueError):
            continue
        cap = turn_speed_cap_kmh(angle, rules)
        if cap is not None:
            out.append({'progress_m':p,'speed_cap_kmh':cap,'angle_deg':angle,'kind':'MODELED_TURN'})
    return out


def spatial_slowdown_spans(spans, points, start_m, end_m, config, initial_speed_kmh, strength):
    """Positive approach/crawl/recovery caps; existing solver supplies braking.

    Geometry-based representation, NOT observed traffic/signal phase. Overlap
    uses the strictest cap once. No new stops and no change to posted limits.
    """
    strength = max(0.0, min(1.0, float(strength)))
    if not points or strength <= 0:
        return []
    approach = max(20.0, min(150.0, float(config.get('spatial_approach_m',90))))
    exit_m = max(10.0, min(50.0, float(config.get('spatial_exit_m',25))))
    plateau = min(approach / 2, max(5.0, float(config.get('spatial_plateau_m',35))))
    floor = kmh_to_mps(max(1.0, float(config.get('spatial_min_speed_kmh',1))))
    brake = max(.05, float(config['braking_mps2']))
    initial = kmh_to_mps(max(0.0, float(initial_speed_kmh)))
    out = []
    for point in points:
        anchor = float(point['progress_m'])
        if not start_m < anchor < end_m:
            continue
        local_approach=max(20.0,min(150.0,float(point.get('approach_m',approach))))
        local_plateau=min(local_approach/2,max(5.0,float(point.get('plateau_m',plateau))))
        # Stronger modeled delay also sustains the crawl longer, bounded by
        # half this SAME approach zone. No inferred queue or wider road zone.
        # This leaves at least half the approach available for deceleration.
        local_plateau += strength * (local_approach / 2 - local_plateau)
        lo, hi = max(start_m,anchor-local_approach), min(end_m,anchor+exit_m)
        positions = [lo, hi, anchor, max(lo,anchor-local_plateau)]
        cursor = lo
        while cursor < hi:
            positions.append(cursor);cursor += 5.0
        caps = {}
        for p in positions:
            if not start_m <= p <= end_m:
                continue
            weight = (min(1.0,(p-(anchor-local_approach))/(local_approach-local_plateau)) if p<=anchor
                      else max(0.0,1.0-(p-anchor)/exit_m))
            base = _cap_at(p,spans)
            desired = base - strength * weight * max(0.0,base-floor)
            # A newly learned delay cannot require instantaneous deceleration.
            reachable = math.sqrt(max(0.0,initial*initial-2*brake*(p-start_m)))
            cap = min(base,max(desired,reachable)) * 3.6
            key = round(p,6);caps[key] = min(caps.get(key,cap),cap)
        # A speed valley is a continuous road zone, not isolated low-speed
        # knots that would cause fake acceleration between sampling grids.
        ordered=sorted(caps.items())
        for (a,va),(b,vb) in zip(ordered,ordered[1:]):
            if b>a:
                out.append({'from_m':a,'to_m':b,'speed_cap_kmh':max(va,vb)})
    return out


def remaining_eta_spans(spans, start_m, end_m, config, initial_speed_kmh, strength):
    """Adapt remaining moving speed to a revised ETA, without inventing a site.

    Unlike mapped obstacle zones this envelope covers only the untravelled
    leg. The initial braking envelope preserves NOW speed; the existing solver
    supplies acceleration, station braking and all hard edge/vehicle limits.
    No hold, guessed queue, past intersection or global time scaling is added.
    """
    strength = max(0.0, min(1.0, float(strength)))
    if strength <= 0 or end_m <= start_m:
        return []
    floor = kmh_to_mps(max(1.0, float(config.get('spatial_min_speed_kmh', 1))))
    brake = max(.05, float(config['braking_mps2']))
    initial = kmh_to_mps(max(0.0, float(initial_speed_kmh)))
    out = []
    for source in spans:
        a = max(float(start_m), float(source['from_m']))
        b = min(float(end_m), float(source['to_m']))
        if b <= a:
            continue
        base = kmh_to_mps(float(source['speed_cap_kmh']))
        desired = base - strength * max(0.0, base - floor)
        braking_end = start_m + max(0.0, initial * initial - desired * desired) / (2 * brake)
        positions = [a, b]
        cursor = a + 5.0
        while cursor < min(b, braking_end):
            positions.append(cursor)
            cursor += 5.0
        if a < braking_end < b:
            positions.append(braking_end)
        positions.sort()
        for lo, hi in zip(positions, positions[1:]):
            reachable = math.sqrt(max(0.0, initial * initial - 2 * brake * (lo - start_m)))
            out.append({'from_m':lo, 'to_m':hi,
                        'speed_cap_kmh':min(base, max(desired, reachable)) * 3.6})
    return out


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


def _caps_at_positions(positions: list[float], spans: list[dict]) -> list[float]:
    """The exact existing cap rule, swept over sorted trajectory positions.

    Preserve the inclusive 1 mm boundary tolerance and the legacy gap fallback.
    Only the lookup cost changes: O(N*S) becomes O(N + S*log(S)).
    """
    intervals=sorted((float(s['from_m'])-.001,float(s['to_m'])+.001,
                      kmh_to_mps(float(s['speed_cap_kmh'])),i) for i,s in enumerate(spans))
    fallback=max(.1,min(item[2] for item in intervals)) if intervals else kmh_to_mps(10)
    active=[]
    cursor=0
    out=[]
    for position in positions:
        while cursor<len(intervals) and intervals[cursor][0]<=position:
            _,end,cap,index=intervals[cursor]
            heapq.heappush(active,(cap,end,index))
            cursor+=1
        while active and active[0][1]<position:
            heapq.heappop(active)
        out.append(max(.1,active[0][0]) if active else fallback)
    return out


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
    caps = _caps_at_positions(positions, spans)

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


def remaining_trajectory(trajectory, elapsed_s, time_scale=1.0):
    """Existing WIP NOW clipping: retain legal motion without a speed reset."""
    scale=max(1.0,float(time_scale));elapsed=max(0.0,elapsed_s/scale)
    segments=[];total=0.0
    for source in trajectory.get('segments') or []:
        if source['t1']<=elapsed:
            continue
        offset=max(0.0,elapsed-source['t0'])
        acceleration=(source['v1']-source['v0'])/max(.001,source['t1']-source['t0'])
        p0=source['p0']+source['v0']*offset+.5*acceleration*offset*offset
        dt=(source['t1']-max(elapsed,source['t0']))*scale
        segments.append({'t0':total,'t1':total+dt,'p0':p0,'p1':source['p1'],
            'v0':(source['v0']+acceleration*offset)/scale,'v1':source['v1']/scale,
            'state':source.get('state','MOVING')})
        total+=dt
    return {'start_m':segments[0]['p0'] if segments else trajectory['end_m'],
            'end_m':trajectory['end_m'],'duration_s':total,'segments':segments,
            'model':trajectory.get('model'),'traffic_edge_count':trajectory.get('traffic_edge_count',0),
            'signal_stop_count':sum(s['state']!='MOVING' for s in segments)}


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
