// Zoom-smart supplement landmarks (MD-X001..MD-X070).
// Close zoom (15-16, the /app entry zoom): full realistic diorama, nice sizes.
// Far zoom: smaller teaser that invites zoom-in, decluttered so pins never stack.
import { SUPPLEMENT_LANDMARKS, SupplementLandmark } from "./supplementLandmarks.generated";

export type { SupplementLandmark };
export { SUPPLEMENT_LANDMARKS };

export type LandmarkAppearance = {
  size: number;
  bucket: string;
  detail: boolean;
  teaser: boolean;
};

/** Shared size curve for web + native. Close zoom renders full size. */
export function landmarkAppearance(zoom: number): LandmarkAppearance {
  const z = Number.isFinite(zoom) ? zoom : 14;
  if (z < 11) return { size: 24, bucket: "teaser", detail: false, teaser: true };
  if (z < 12.5) return { size: 30, bucket: "teaser+", detail: false, teaser: true };
  if (z < 14) return { size: 38, bucket: "invite", detail: false, teaser: true };
  if (z < 15) return { size: 46, bucket: "near", detail: true, teaser: false };
  if (z < 16) return { size: 54, bucket: "close", detail: true, teaser: false };
  if (z < 17) return { size: 60, bucket: "full", detail: true, teaser: false };
  return { size: 66, bucket: "full+", detail: true, teaser: false };
}

/** Opacity: a landmark over a business pin fades on close zoom so the pin behind is tappable. */
export function landmarkOpacity(zoom: number, hasBusinessBehind: boolean): number {
  if (!hasBusinessBehind) return 1;
  const z = Number.isFinite(zoom) ? zoom : 14;
  if (z >= 17) return 0.32;
  if (z >= 16) return 0.45;
  if (z >= 15) return 0.7;
  return 1;
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Greedy declutter: keep priority order, drop landmarks closer than the
 * on-screen footprint at this zoom. Far zoom hides more (invites zoom-in),
 * close zoom keeps almost everything realistic.
 */
export function declutterLandmarks<T extends { latitude: number; longitude: number }>(
  items: readonly T[],
  zoom: number,
): T[] {
  const z = Number.isFinite(zoom) ? zoom : 14;
  const size = landmarkAppearance(z).size;
  const metersPerPixel = (40075016.686 * Math.cos(52.13 * Math.PI / 180)) / (256 * 2 ** z);
  const minMeters = Math.max(12, size * metersPerPixel * 0.85);
  const kept: T[] = [];
  for (const item of items) {
    let clash = false;
    for (const k of kept) {
      if (haversineM(item.latitude, item.longitude, k.latitude, k.longitude) < minMeters) {
        clash = true;
        break;
      }
    }
    if (!clash) kept.push(item);
  }
  return kept;
}

/** True when a business/entity pin sits under the landmark (within ~18 m). */
export function landmarkHasBusinessBehind(
  landmark: { latitude: number; longitude: number },
  pins: readonly { latitude: number; longitude: number }[],
  radiusM = 18,
): boolean {
  for (const p of pins) {
    if (haversineM(landmark.latitude, landmark.longitude, p.latitude, p.longitude) <= radiusM) return true;
  }
  return false;
}
