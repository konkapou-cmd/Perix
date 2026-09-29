import { useEffect, useState } from "react";
import { reverseGeocodeLabel } from "./reverseGeocode";
import i18n from "../i18n";

// Addresses saved by the old picker flow ("Next to X Street" in whatever
// language was active at save time) need re-localization for the current
// app language. The prefix and the street name are language-specific.
const NEAR_PREFIXES = ["Next to", "In der Nähe von", "Δίπλα στην", "Δίπλα σε"];

export function isNearLabelAddress(address: string | null | undefined): boolean {
  return typeof address === "string" && NEAR_PREFIXES.some((p) => address.startsWith(p));
}

const cache = new Map<string, string>();

function cacheKey(lat: number, lng: number): string {
  const lang = i18n.language || "en";
  return `${lang}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
}

/**
 * Returns the address re-localized in the current app language when it is a
 * "Next to X street" label (re-geocodes once and caches). Falls back to the
 * stored address until/unless the geocode resolves.
 */
export function useLocalizedAddress(
  address: string | null | undefined,
  lat?: number | null,
  lng?: number | null
): string | null | undefined {
  const key = lat != null && lng != null ? cacheKey(lat, lng) : null;
  const [localized, setLocalized] = useState<string | null>(key ? cache.get(key) ?? null : null);

  useEffect(() => {
    if (!key || !isNearLabelAddress(address)) return;
    if (cache.has(key)) {
      setLocalized(cache.get(key)!);
      return;
    }
    let cancelled = false;
    reverseGeocodeLabel(lat!, lng!)
      .then((label) => {
        if (cancelled || !label) return;
        cache.set(key, label);
        setLocalized(label);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, address, lat, lng]);

  return localized ?? address;
}

/**
 * Bulk variant for lists (e.g. the business carousel): re-localizes every
 * "Next to" address in the background and returns a Map of id -> address.
 */
export function useLocalizedAddressMap(
  items: { id: string; address?: string | null; latitude?: number | null; longitude?: number | null }[]
): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const targets = items.filter(
      (it) =>
        it.latitude != null &&
        it.longitude != null &&
        isNearLabelAddress(it.address) &&
        !cache.has(cacheKey(it.latitude, it.longitude))
    );
    if (targets.length === 0) return;
    let index = 0;
    const next = () => {
      if (cancelled || index >= targets.length) return;
      const it = targets[index];
      const key = cacheKey(it.latitude!, it.longitude!);
      reverseGeocodeLabel(it.latitude!, it.longitude!)
        .then((label) => {
          if (label) cache.set(key, label);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) {
            setMap((prev) => {
              const cached = cache.get(key);
              if (!cached) return prev;
              const nextMap = new Map(prev);
              nextMap.set(it.id, cached);
              return nextMap;
            });
            index += 1;
            setTimeout(next, 120);
          }
        });
    };
    next();
    return () => {
      cancelled = true;
    };
  }, [items]);

  return map;
}
