export type RoadWay = { lat: number; lng: number }[];
export type PackedRoadWay = [number, number][];

/**
 * Filter packed OSM road polylines to the ones near the game origin.
 * A way qualifies when ANY of its points lies inside the radius bbox;
 * the list is capped so the per-frame street-bound check stays fast.
 */
export function filterRoadWays(
  ways: PackedRoadWay[],
  origin: { latitude: number; longitude: number },
  radiusM = 450,
  cap = 500
): RoadWay[] {
  if (!Number.isFinite(origin.latitude) || !Number.isFinite(origin.longitude)) return [];
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((origin.latitude * Math.PI) / 180));
  const out: RoadWay[] = [];
  for (const way of ways) {
    if (!Array.isArray(way)) continue;
    let inside = false;
    for (const p of way) {
      if (
        Array.isArray(p) &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[0] - origin.latitude) <= dLat &&
        Math.abs(p[1] - origin.longitude) <= dLng
      ) {
        inside = true;
        break;
      }
    }
    if (!inside) continue;
    const pts: RoadWay = [];
    for (const p of way) {
      if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
        pts.push({ lat: p[0], lng: p[1] });
      }
    }
    if (pts.length >= 2) out.push(pts);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Fetch the packaged Magdeburg OSM road polylines (Geofabrik/OpenStreetMap,
 * ODbL - attribution shown in the game) and keep the ways around the origin.
 * Any failure falls back to free-roam (empty list) - the game never breaks.
 */
export async function loadGameRoads(origin: {
  latitude: number;
  longitude: number;
}): Promise<RoadWay[]> {
  try {
    const res = await fetch("/game/magdeburg-roads.json.gz");
    if (!res.ok) return [];
    const buf = await res.arrayBuffer();
    const DC = (window as any).DecompressionStream;
    let text: string;
    if (DC) {
      const stream = new Response(new Blob([buf]).stream().pipeThrough(new DC("gzip")));
      text = await stream.text();
    } else {
      // No DecompressionStream: try a plain parse (some proxies already
      // decompress gzip assets); otherwise this returns [] below.
      text = new TextDecoder().decode(buf);
    }
    const data = JSON.parse(text);
    return filterRoadWays(Array.isArray(data?.ways) ? data.ways : [], origin);
  } catch {
    return [];
  }
}
