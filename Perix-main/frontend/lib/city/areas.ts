import type { CityBounds } from "./publicServices";
import { MAGDEBURG_BOUNDS } from "./publicServices";

export type Area = {
  id: string;
  cityId: string;
  countryCode: string;
  label: { el: string; de: string; en: string };
  shortLabel: { el: string; de: string; en: string };
  bounds: CityBounds;
  initialRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  isHomeArea: boolean;
  mobilityEnabled: boolean;
};

/** Magdeburg stays the default home area. Gardelegen and future areas plug in here. */
export const AREAS: Area[] = [
  {
    id: "magdeburg",
    countryCode: "DE",
    cityId: "de-magdeburg",
    label: { el: "Μαγδεβούργο", de: "Magdeburg", en: "Magdeburg" },
    shortLabel: { el: "MD", de: "MD", en: "MD" },
    bounds: MAGDEBURG_BOUNDS,
    initialRegion: { latitude: 52.14, longitude: 11.635, latitudeDelta: 0.16, longitudeDelta: 0.23 },
    isHomeArea: true,
    mobilityEnabled: true,
  },
  {
    id: "gardelegen",
    countryCode: "DE",
    cityId: "de-gardelegen",
    label: { el: "Γκάρντελεγκεν", de: "Gardelegen", en: "Gardelegen" },
    shortLabel: { el: "GAR", de: "GAR", en: "GAR" },
    bounds: { minLat: 52.415, maxLat: 52.634, minLng: 11.11, maxLng: 11.604 },
    initialRegion: { latitude: 52.527, longitude: 11.393, latitudeDelta: 0.30, longitudeDelta: 0.55 },
    isHomeArea: false,
    mobilityEnabled: false,
  },
  {
    id: "berlin",
    countryCode: "DE",
    cityId: "de-berlin-vbb",
    label: { el: "Βερολίνο", de: "Berlin", en: "Berlin" },
    shortLabel: { el: "BER", de: "BER", en: "BER" },
    bounds: { minLat: 52.35, maxLat: 52.70, minLng: 13.05, maxLng: 13.80 },
    initialRegion: { latitude: 52.52, longitude: 13.405, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    isHomeArea: false,
    mobilityEnabled: true,
  },
  {
    id: "acharnes",
    countryCode: "GR",
    cityId: "gr-acharnes",
    label: { el: "Αχαρνές", de: "Acharnes", en: "Acharnes" },
    shortLabel: { el: "ΑΧ", de: "ACH", en: "ACH" },
    bounds: { minLat: 38.0415, maxLat: 38.2299, minLng: 23.6681, maxLng: 23.8267 },
    initialRegion: { latitude: 38.1357, longitude: 23.7474, latitudeDelta: 0.25, longitudeDelta: 0.22 },
    isHomeArea: false,
    mobilityEnabled: false,
  },
  {
    id: "agioi-anargyroi",
    countryCode: "GR",
    cityId: "gr-agioi-anargyroi",
    label: { el: "Άγιοι Ανάργυροι", de: "Agii Anargyri", en: "Agii Anargyri" },
    shortLabel: { el: "ΑΝ", de: "AN", en: "AN" },
    bounds: { minLat: 38.007, maxLat: 38.0719, minLng: 23.681, maxLng: 23.7425 },
    initialRegion: { latitude: 38.0395, longitude: 23.7118, latitudeDelta: 0.12, longitudeDelta: 0.12 },
    isHomeArea: false,
    mobilityEnabled: false,
  },
  {
    id: "syros",
    countryCode: "GR",
    cityId: "gr-syros",
    label: { el: "Σύρος", de: "Syros", en: "Syros" },
    shortLabel: { el: "ΣΥ", de: "SY", en: "SY" },
    bounds: { minLat: 37.3664, maxLat: 37.5125, minLng: 24.8567, maxLng: 24.982 },
    initialRegion: { latitude: 37.4395, longitude: 24.9194, latitudeDelta: 0.20, longitudeDelta: 0.18 },
    isHomeArea: false,
    mobilityEnabled: false,
  },
  {
    id: "mykonos",
    countryCode: "GR",
    cityId: "gr-mykonos",
    label: { el: "Μύκονος", de: "Mykonos", en: "Mykonos" },
    shortLabel: { el: "ΜΥ", de: "MY", en: "MY" },
    bounds: { minLat: 37.3975, maxLat: 37.4994, minLng: 25.2947, maxLng: 25.4705 },
    initialRegion: { latitude: 37.4485, longitude: 25.3826, latitudeDelta: 0.16, longitudeDelta: 0.24 },
    isHomeArea: false,
    mobilityEnabled: false,
  },
];

export const DEFAULT_AREA_ID = "magdeburg";

export function getArea(id: string | null | undefined): Area {
  return AREAS.find(area => area.id === id) ?? AREAS[0];
}

export type CityRef = { countryCode: string; cityId: string };

/** Areas whose bounds intersect the viewport. The directory fans out to these cities. */
export function areasInScope(bounds: CityBounds): Area[] {
  return AREAS.filter(area => bounds.minLat <= area.bounds.maxLat && bounds.maxLat >= area.bounds.minLat
    && bounds.minLng <= area.bounds.maxLng && bounds.maxLng >= area.bounds.minLng);
}

/** Transit UI is available when the confirmed origin sits in a mobility area. */
export function mobilityAreaFor(point: { latitude: number; longitude: number } | null | undefined): Area | null {
  if (!point) return null;
  return AREAS.find(area => area.mobilityEnabled
    && point.latitude >= area.bounds.minLat && point.latitude <= area.bounds.maxLat
    && point.longitude >= area.bounds.minLng && point.longitude <= area.bounds.maxLng) ?? null;
}
