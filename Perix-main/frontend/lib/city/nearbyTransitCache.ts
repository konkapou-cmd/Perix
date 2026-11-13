import { getNearbyMap, getNearbyStops } from "../api/mobility";
import type { TransitStopMarker, V2MapLine, V2SourceManifest } from "../api/mobility";
import {
  APP_NEARBY_STOP_RADIUS_M,
  nearestTransitStops,
  nearbyScopeBounds,
  validOrigin,
  type OriginPoint,
} from "./nearbyTransit";

/**
 * Screen-level snapshot of the /app nearby-transit catalogue (closest stops
 * + their route geometries). The API layer already caches network responses;
 * this keeps the *rendered* rows across remounts and anchor switches so the
 * App never flashes empty/spinners for an anchor it has already resolved.
 * Entries are stale-while-revalidate: callers render the snapshot instantly
 * and refresh it silently in the background.
 */
export interface NearbyCatalogueSnapshot {
  liveStops: TransitStopMarker[];
  transitLines: V2MapLine[];
  manifests: V2SourceManifest[];
  updatedAt: number;
}

const snapshots = new Map<string, NearbyCatalogueSnapshot>();
const inflight = new Map<string, Promise<NearbyCatalogueSnapshot | null>>();
const MAX_ENTRIES = 12;

export function getNearbyCatalogueSnapshot(key: string | null | undefined): NearbyCatalogueSnapshot | undefined {
  if (!key) return undefined;
  return snapshots.get(key);
}

export function setNearbyCatalogueSnapshot(
  key: string,
  entry: { liveStops: TransitStopMarker[]; transitLines: V2MapLine[]; manifests: V2SourceManifest[] }
): void {
  if (snapshots.size >= MAX_ENTRIES && !snapshots.has(key)) {
    const oldest = snapshots.keys().next().value;
    if (oldest !== undefined) snapshots.delete(oldest);
  }
  snapshots.set(key, { ...entry, updatedAt: Date.now() });
}

async function loadCatalogue(
  origin: OriginPoint,
  limit: number,
  radiusM: number,
  selectedStopId: string | null
): Promise<NearbyCatalogueSnapshot | null> {
  const bounds = nearbyScopeBounds(origin, radiusM + 10);
  const firstStage = await getNearbyStops(null, origin, bounds, { limit, radiusM });
  const rows = nearestTransitStops(firstStage.stops || [], origin, limit, radiusM, selectedStopId).map(row => row.stop);
  if (!rows.length) return { liveStops: [], transitLines: [], manifests: [], updatedAt: Date.now() };
  const nearbyLines = await getNearbyMap(null, origin, bounds, { limit, radiusM });
  return {
    liveStops: rows,
    transitLines: nearbyLines.lines || [],
    manifests: nearbyLines.source_manifests || [],
    updatedAt: Date.now(),
  };
}

/** Silent background refresh for an already-known anchor. Dedupes concurrent callers. */
export function fetchNearbyCatalogue(
  key: string,
  origin: OriginPoint,
  limit: number,
  radiusM: number,
  selectedStopId: string | null
): Promise<NearbyCatalogueSnapshot | null> {
  const pending = inflight.get(key);
  if (pending) return pending;
  const task = loadCatalogue(origin, limit, radiusM, selectedStopId)
    .then(entry => {
      if (entry) setNearbyCatalogueSnapshot(key, entry);
      inflight.delete(key);
      return entry;
    })
    .catch(() => {
      inflight.delete(key);
      return null;
    });
  inflight.set(key, task);
  return task;
}

/**
 * Warm the cache for a manually entered address (called right after
 * setUserOrigin, e.g. from /home or the origin editor) so /app finds the
 * stops ready when the user returns. Fire-and-forget, never throws.
 */
export function prefetchNearbyCatalogue(origin: OriginPoint | null | undefined): void {
  try {
    if (!validOrigin(origin)) return;
    const key = `${origin.latitude.toFixed(3)}:${origin.longitude.toFixed(3)}:origin`;
    if (snapshots.has(key) || inflight.has(key)) return;
    void fetchNearbyCatalogue(
      key,
      { latitude: origin.latitude, longitude: origin.longitude },
      5,
      APP_NEARBY_STOP_RADIUS_M,
      null
    ).catch(() => {});
  } catch {}
}
