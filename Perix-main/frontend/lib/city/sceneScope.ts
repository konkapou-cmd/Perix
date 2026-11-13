import type { CityBounds } from "./publicServices";
import { nearbyScopeBounds, validOrigin } from "./nearbyTransit";

export const APP_SCENE_RADIUS_M = 10_000;
type Point = { latitude: number; longitude: number; kind?: "live" | "manual" };
export type SceneScope = { key: string; kind: string; revision: number; center: Point; bounds: CityBounds };

/** Camera movement and ordinary GPS updates must never replace a loaded scene. */
export function updateSceneScope(previous: SceneScope | null, origin: Point | null, revision = 0): SceneScope | null {
  const kind = origin?.kind || "manual";
  if (!validOrigin(origin)) return null;
  const key = `${kind}:${kind === "live" ? "confirmed" : `${origin.latitude.toFixed(6)}:${origin.longitude.toFixed(6)}`}:${revision}`;
  if (previous?.key === key) return previous;
  const center = { latitude: origin.latitude, longitude: origin.longitude, kind };
  return { key, kind, revision, center, bounds: nearbyScopeBounds(center, APP_SCENE_RADIUS_M) };
}

export function withinSceneRadius(point: { latitude: number; longitude: number }, scope: SceneScope) {
  const radians = Math.PI / 180;
  const a = scope.center, h = Math.sin((point.latitude - a.latitude) * radians / 2) ** 2
    + Math.cos(a.latitude * radians) * Math.cos(point.latitude * radians) * Math.sin((point.longitude - a.longitude) * radians / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h))) <= APP_SCENE_RADIUS_M;
}
