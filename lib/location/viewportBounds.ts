export type ViewportBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat?: number;
  centerLng?: number;
};

export function isEntityInsideBounds(
  lat: number | null | undefined,
  lng: number | null | undefined,
  bounds: ViewportBounds | null,
): boolean {
  if (lat == null || lng == null || !bounds) return false;
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}

export function buildBoundsKey(bounds: ViewportBounds): string {
  return `${bounds.minLat.toFixed(4)}:${bounds.maxLat.toFixed(4)}:${bounds.minLng.toFixed(4)}:${bounds.maxLng.toFixed(4)}`;
}

export function boundsFromRegion(
  latitude: number,
  longitude: number,
  latitudeDelta: number,
  longitudeDelta: number,
): ViewportBounds {
  return {
    minLat: latitude - latitudeDelta / 2,
    maxLat: latitude + latitudeDelta / 2,
    minLng: longitude - longitudeDelta / 2,
    maxLng: longitude + longitudeDelta / 2,
    centerLat: latitude,
    centerLng: longitude,
  };
}

export function boundsCenter(bounds: ViewportBounds): { latitude: number; longitude: number } {
  return {
    latitude: bounds.centerLat ?? (bounds.minLat + bounds.maxLat) / 2,
    longitude: bounds.centerLng ?? (bounds.minLng + bounds.maxLng) / 2,
  };
}

export function boundsToDiscoveryQuery(bounds: ViewportBounds): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  return {
    minLat: bounds.minLat,
    maxLat: bounds.maxLat,
    minLng: bounds.minLng,
    maxLng: bounds.maxLng,
  };
}
