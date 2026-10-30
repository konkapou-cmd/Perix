import { getV2Map, LiveVehicle, V2Map, V2MapLine } from "./api/mobility";

export const NETWORK_REFRESH_MS = 5 * 60 * 1000;
export const NETWORK_SCOPE_RETRY_MS = 30000;
export const stopVisibilityBucket = (zoom: number | null) => (zoom ?? 14) >= 15.3 ? "all" : (zoom ?? 14) >= 13.2 ? "major" : "selected";
let snapshot: V2Map | null = null;
let lineSignature = "";
let stopSignature = "";
let otherSignature = "";
let refreshedAt = 0;
let attemptedAt = 0;
let pending: Promise<V2Map> | null = null;

export const networkScope = (value: { pattern_id?: string | null; network_version_id?: string; service_date?: string }) =>
  JSON.stringify([value.network_version_id || null, value.service_date || null, value.pattern_id || null]);

export function canonicalVehicleLine(lines: V2MapLine[], vehicle: LiveVehicle) {
  if (!vehicle.pattern_id || !vehicle.network_version_id || !vehicle.service_date) return undefined;
  const matches = lines.filter(line => line.valid !== false && line.pattern_id === vehicle.pattern_id
    && (!vehicle.network_version_id || line.network_version_id === vehicle.network_version_id)
    && (!vehicle.service_date || line.service_date === vehicle.service_date));
  return matches.length === 1 ? matches[0] : undefined;
}

export function cachedMobilityNetwork() { return snapshot; }
export function networkRefreshDelay() { return Math.max(1000, NETWORK_REFRESH_MS - (Date.now() - refreshedAt)); }
export function missingNetworkScopes(map: V2Map | null, scopes: string[]) {
  const known = new Set((map?.lines || []).filter(line => line.valid !== false).map(networkScope));
  return scopes.some(scope => !known.has(scope));
}

/** Cache static data only, never positions/ETAs. Coalesce views' overlapping reads. */
export function loadMobilityNetwork(token: string | null | undefined, scopes: string[], force = false): Promise<V2Map> {
  const now = Date.now();
  if (pending) return pending;
  const needsScope = missingNetworkScopes(snapshot, scopes) && now - attemptedAt >= NETWORK_SCOPE_RETRY_MS;
  if (!force && snapshot && now >= refreshedAt && now - refreshedAt < NETWORK_REFRESH_MS && !needsScope) return Promise.resolve(snapshot);
  attemptedAt = now;
  const task: Promise<V2Map> = getV2Map(token).then(map => {
    if (!map || !Array.isArray(map.lines) || !Array.isArray(map.stops)) throw new Error("Invalid transit network snapshot");
    const nextLines = JSON.stringify(map.lines), nextStops = JSON.stringify(map.stops);
    const nextOther = JSON.stringify({ ...map, lines: undefined, stops: undefined });
    if (!snapshot || lineSignature !== nextLines || stopSignature !== nextStops || otherSignature !== nextOther) {
      snapshot = { ...map, lines: snapshot && lineSignature === nextLines ? snapshot.lines : map.lines,
        stops: snapshot && stopSignature === nextStops ? snapshot.stops : map.stops };
      lineSignature = nextLines; stopSignature = nextStops; otherSignature = nextOther;
    }
    refreshedAt = Date.now();
    return snapshot!;
  }).finally(() => { if (pending === task) pending = null; });
  pending = task;
  return task;
}
