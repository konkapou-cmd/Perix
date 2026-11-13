// Static 128px transparent map-view assets.
// Legacy Magdeburg bus/tram/bus_stop: calibrated against the original
// Perix-Mobility-360 artwork (090 front, 180 rear, 000 left, 270 right).
// New turntable packs (subway/s-bahn/ferry/vehicles + the five stop types):
// clean 30-degree rotation, 000 front, 090 right side, 180 back, 270 left side.
import type { ImageSourcePropType } from "react-native";

export type MobilityViewKind =
  | "bus" | "tram" | "subway" | "s-bahn" | "rail" | "ferry"
  | "metro" | "isap" | "athens_bus" | "blue_star"
  | "bus_stop" | "athens_bus_stop" | "athens_isap_stop"
  | "athens_metro_stop" | "berlin_u_bahn_stop" | "berlin_s_bahn_stop";

const LEGACY_TRAM = {
  0: require("../assets/mobility-views/tram/000.webp"),
  30: require("../assets/mobility-views/tram/030.webp"),
  60: require("../assets/mobility-views/tram/060.webp"),
  90: require("../assets/mobility-views/tram/090.webp"),
  120: require("../assets/mobility-views/tram/120.webp"),
  150: require("../assets/mobility-views/tram/150.webp"),
  180: require("../assets/mobility-views/tram/180.webp"),
  210: require("../assets/mobility-views/tram/210.webp"),
  240: require("../assets/mobility-views/tram/240.webp"),
  270: require("../assets/mobility-views/tram/270.webp"),
  300: require("../assets/mobility-views/tram/300.webp"),
  330: require("../assets/mobility-views/tram/330.webp"),
};

export const MOBILITY_VIEW_SOURCES: Record<MobilityViewKind, Record<number, ImageSourcePropType>> = {
  "bus": {
    0: require("../assets/mobility-views/bus/000.webp"),
    30: require("../assets/mobility-views/bus/030.webp"),
    60: require("../assets/mobility-views/bus/060.webp"),
    90: require("../assets/mobility-views/bus/090.webp"),
    120: require("../assets/mobility-views/bus/120.webp"),
    150: require("../assets/mobility-views/bus/150.webp"),
    180: require("../assets/mobility-views/bus/180.webp"),
    210: require("../assets/mobility-views/bus/210.webp"),
    240: require("../assets/mobility-views/bus/240.webp"),
    270: require("../assets/mobility-views/bus/270.webp"),
    300: require("../assets/mobility-views/bus/300.webp"),
    330: require("../assets/mobility-views/bus/330.webp"),
  },
  tram: { ...LEGACY_TRAM },
  "subway": {
    0: require("../assets/mobility-views/subway/000.webp"),
    30: require("../assets/mobility-views/subway/030.webp"),
    60: require("../assets/mobility-views/subway/060.webp"),
    90: require("../assets/mobility-views/subway/090.webp"),
    120: require("../assets/mobility-views/subway/120.webp"),
    150: require("../assets/mobility-views/subway/150.webp"),
    180: require("../assets/mobility-views/subway/180.webp"),
    210: require("../assets/mobility-views/subway/210.webp"),
    240: require("../assets/mobility-views/subway/240.webp"),
    270: require("../assets/mobility-views/subway/270.webp"),
    300: require("../assets/mobility-views/subway/300.webp"),
    330: require("../assets/mobility-views/subway/330.webp"),
  },
  "s-bahn": {
    0: require("../assets/mobility-views/s-bahn/000.webp"),
    30: require("../assets/mobility-views/s-bahn/030.webp"),
    60: require("../assets/mobility-views/s-bahn/060.webp"),
    90: require("../assets/mobility-views/s-bahn/090.webp"),
    120: require("../assets/mobility-views/s-bahn/120.webp"),
    150: require("../assets/mobility-views/s-bahn/150.webp"),
    180: require("../assets/mobility-views/s-bahn/180.webp"),
    210: require("../assets/mobility-views/s-bahn/210.webp"),
    240: require("../assets/mobility-views/s-bahn/240.webp"),
    270: require("../assets/mobility-views/s-bahn/270.webp"),
    300: require("../assets/mobility-views/s-bahn/300.webp"),
    330: require("../assets/mobility-views/s-bahn/330.webp"),
  },
  "ferry": {
    0: require("../assets/mobility-views/ferry/000.webp"),
    30: require("../assets/mobility-views/ferry/030.webp"),
    60: require("../assets/mobility-views/ferry/060.webp"),
    90: require("../assets/mobility-views/ferry/090.webp"),
    120: require("../assets/mobility-views/ferry/120.webp"),
    150: require("../assets/mobility-views/ferry/150.webp"),
    180: require("../assets/mobility-views/ferry/180.webp"),
    210: require("../assets/mobility-views/ferry/210.webp"),
    240: require("../assets/mobility-views/ferry/240.webp"),
    270: require("../assets/mobility-views/ferry/270.webp"),
    300: require("../assets/mobility-views/ferry/300.webp"),
    330: require("../assets/mobility-views/ferry/330.webp"),
  },
  "rail": {
    0: require("../assets/mobility-views/rail/000.webp"),
    30: require("../assets/mobility-views/rail/030.webp"),
    60: require("../assets/mobility-views/rail/060.webp"),
    90: require("../assets/mobility-views/rail/090.webp"),
    120: require("../assets/mobility-views/rail/120.webp"),
    150: require("../assets/mobility-views/rail/150.webp"),
    180: require("../assets/mobility-views/rail/180.webp"),
    210: require("../assets/mobility-views/rail/210.webp"),
    240: require("../assets/mobility-views/rail/240.webp"),
    270: require("../assets/mobility-views/rail/270.webp"),
    300: require("../assets/mobility-views/rail/300.webp"),
    330: require("../assets/mobility-views/rail/330.webp"),
  },
  "metro": {
    0: require("../assets/mobility-views/metro/000.webp"),
    30: require("../assets/mobility-views/metro/030.webp"),
    60: require("../assets/mobility-views/metro/060.webp"),
    90: require("../assets/mobility-views/metro/090.webp"),
    120: require("../assets/mobility-views/metro/120.webp"),
    150: require("../assets/mobility-views/metro/150.webp"),
    180: require("../assets/mobility-views/metro/180.webp"),
    210: require("../assets/mobility-views/metro/210.webp"),
    240: require("../assets/mobility-views/metro/240.webp"),
    270: require("../assets/mobility-views/metro/270.webp"),
    300: require("../assets/mobility-views/metro/300.webp"),
    330: require("../assets/mobility-views/metro/330.webp"),
  },
  "isap": {
    0: require("../assets/mobility-views/isap/000.webp"),
    30: require("../assets/mobility-views/isap/030.webp"),
    60: require("../assets/mobility-views/isap/060.webp"),
    90: require("../assets/mobility-views/isap/090.webp"),
    120: require("../assets/mobility-views/isap/120.webp"),
    150: require("../assets/mobility-views/isap/150.webp"),
    180: require("../assets/mobility-views/isap/180.webp"),
    210: require("../assets/mobility-views/isap/210.webp"),
    240: require("../assets/mobility-views/isap/240.webp"),
    270: require("../assets/mobility-views/isap/270.webp"),
    300: require("../assets/mobility-views/isap/300.webp"),
    330: require("../assets/mobility-views/isap/330.webp"),
  },
  "athens_bus": {
    0: require("../assets/mobility-views/athens_bus/000.webp"),
    30: require("../assets/mobility-views/athens_bus/030.webp"),
    60: require("../assets/mobility-views/athens_bus/060.webp"),
    90: require("../assets/mobility-views/athens_bus/090.webp"),
    120: require("../assets/mobility-views/athens_bus/120.webp"),
    150: require("../assets/mobility-views/athens_bus/150.webp"),
    180: require("../assets/mobility-views/athens_bus/180.webp"),
    210: require("../assets/mobility-views/athens_bus/210.webp"),
    240: require("../assets/mobility-views/athens_bus/240.webp"),
    270: require("../assets/mobility-views/athens_bus/270.webp"),
    300: require("../assets/mobility-views/athens_bus/300.webp"),
    330: require("../assets/mobility-views/athens_bus/330.webp"),
  },
  "blue_star": {
    0: require("../assets/mobility-views/blue_star/000.webp"),
    30: require("../assets/mobility-views/blue_star/030.webp"),
    60: require("../assets/mobility-views/blue_star/060.webp"),
    90: require("../assets/mobility-views/blue_star/090.webp"),
    120: require("../assets/mobility-views/blue_star/120.webp"),
    150: require("../assets/mobility-views/blue_star/150.webp"),
    180: require("../assets/mobility-views/blue_star/180.webp"),
    210: require("../assets/mobility-views/blue_star/210.webp"),
    240: require("../assets/mobility-views/blue_star/240.webp"),
    270: require("../assets/mobility-views/blue_star/270.webp"),
    300: require("../assets/mobility-views/blue_star/300.webp"),
    330: require("../assets/mobility-views/blue_star/330.webp"),
  },
  "athens_bus_stop": {
    0: require("../assets/mobility-views/athens_bus_stop/000.webp"),
    30: require("../assets/mobility-views/athens_bus_stop/030.webp"),
    60: require("../assets/mobility-views/athens_bus_stop/060.webp"),
    90: require("../assets/mobility-views/athens_bus_stop/090.webp"),
    120: require("../assets/mobility-views/athens_bus_stop/120.webp"),
    150: require("../assets/mobility-views/athens_bus_stop/150.webp"),
    180: require("../assets/mobility-views/athens_bus_stop/180.webp"),
    210: require("../assets/mobility-views/athens_bus_stop/210.webp"),
    240: require("../assets/mobility-views/athens_bus_stop/240.webp"),
    270: require("../assets/mobility-views/athens_bus_stop/270.webp"),
    300: require("../assets/mobility-views/athens_bus_stop/300.webp"),
    330: require("../assets/mobility-views/athens_bus_stop/330.webp"),
  },
  "athens_isap_stop": {
    0: require("../assets/mobility-views/athens_isap_stop/000.webp"),
    30: require("../assets/mobility-views/athens_isap_stop/030.webp"),
    60: require("../assets/mobility-views/athens_isap_stop/060.webp"),
    90: require("../assets/mobility-views/athens_isap_stop/090.webp"),
    120: require("../assets/mobility-views/athens_isap_stop/120.webp"),
    150: require("../assets/mobility-views/athens_isap_stop/150.webp"),
    180: require("../assets/mobility-views/athens_isap_stop/180.webp"),
    210: require("../assets/mobility-views/athens_isap_stop/210.webp"),
    240: require("../assets/mobility-views/athens_isap_stop/240.webp"),
    270: require("../assets/mobility-views/athens_isap_stop/270.webp"),
    300: require("../assets/mobility-views/athens_isap_stop/300.webp"),
    330: require("../assets/mobility-views/athens_isap_stop/330.webp"),
  },
  "athens_metro_stop": {
    0: require("../assets/mobility-views/athens_metro_stop/000.webp"),
    30: require("../assets/mobility-views/athens_metro_stop/030.webp"),
    60: require("../assets/mobility-views/athens_metro_stop/060.webp"),
    90: require("../assets/mobility-views/athens_metro_stop/090.webp"),
    120: require("../assets/mobility-views/athens_metro_stop/120.webp"),
    150: require("../assets/mobility-views/athens_metro_stop/150.webp"),
    180: require("../assets/mobility-views/athens_metro_stop/180.webp"),
    210: require("../assets/mobility-views/athens_metro_stop/210.webp"),
    240: require("../assets/mobility-views/athens_metro_stop/240.webp"),
    270: require("../assets/mobility-views/athens_metro_stop/270.webp"),
    300: require("../assets/mobility-views/athens_metro_stop/300.webp"),
    330: require("../assets/mobility-views/athens_metro_stop/330.webp"),
  },
  "berlin_u_bahn_stop": {
    0: require("../assets/mobility-views/berlin_u_bahn_stop/000.webp"),
    30: require("../assets/mobility-views/berlin_u_bahn_stop/030.webp"),
    60: require("../assets/mobility-views/berlin_u_bahn_stop/060.webp"),
    90: require("../assets/mobility-views/berlin_u_bahn_stop/090.webp"),
    120: require("../assets/mobility-views/berlin_u_bahn_stop/120.webp"),
    150: require("../assets/mobility-views/berlin_u_bahn_stop/150.webp"),
    180: require("../assets/mobility-views/berlin_u_bahn_stop/180.webp"),
    210: require("../assets/mobility-views/berlin_u_bahn_stop/210.webp"),
    240: require("../assets/mobility-views/berlin_u_bahn_stop/240.webp"),
    270: require("../assets/mobility-views/berlin_u_bahn_stop/270.webp"),
    300: require("../assets/mobility-views/berlin_u_bahn_stop/300.webp"),
    330: require("../assets/mobility-views/berlin_u_bahn_stop/330.webp"),
  },
  "berlin_s_bahn_stop": {
    0: require("../assets/mobility-views/berlin_s_bahn_stop/000.webp"),
    30: require("../assets/mobility-views/berlin_s_bahn_stop/030.webp"),
    60: require("../assets/mobility-views/berlin_s_bahn_stop/060.webp"),
    90: require("../assets/mobility-views/berlin_s_bahn_stop/090.webp"),
    120: require("../assets/mobility-views/berlin_s_bahn_stop/120.webp"),
    150: require("../assets/mobility-views/berlin_s_bahn_stop/150.webp"),
    180: require("../assets/mobility-views/berlin_s_bahn_stop/180.webp"),
    210: require("../assets/mobility-views/berlin_s_bahn_stop/210.webp"),
    240: require("../assets/mobility-views/berlin_s_bahn_stop/240.webp"),
    270: require("../assets/mobility-views/berlin_s_bahn_stop/270.webp"),
    300: require("../assets/mobility-views/berlin_s_bahn_stop/300.webp"),
    330: require("../assets/mobility-views/berlin_s_bahn_stop/330.webp"),
  },
  bus_stop: {
    0: require("../assets/mobility-views/bus_stop/000.webp"),
    30: require("../assets/mobility-views/bus_stop/030.webp"),
    60: require("../assets/mobility-views/bus_stop/060.webp"),
    90: require("../assets/mobility-views/bus_stop/090.webp"),
    120: require("../assets/mobility-views/bus_stop/120.webp"),
    150: require("../assets/mobility-views/bus_stop/150.webp"),
    180: require("../assets/mobility-views/bus_stop/180.webp"),
    210: require("../assets/mobility-views/bus_stop/210.webp"),
    240: require("../assets/mobility-views/bus_stop/240.webp"),
    270: require("../assets/mobility-views/bus_stop/270.webp"),
    300: require("../assets/mobility-views/bus_stop/300.webp"),
    330: require("../assets/mobility-views/bus_stop/330.webp"),
  },
};

const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;
export function nearestMobilityViewAngle(angle: number): number {
  const normalized = normalizeAngle(Number.isFinite(angle) ? angle : 0);
  return Math.round(normalized / 30) * 30 % 360;
}

// Legacy bus/tram/rail sprites (090 front, 180 rear, 000 left, 270 right).
// Some supplied frames repeat views out of sequence: use verified octants.
const VEHICLE_SCREEN_VIEWS = [180, 150, 270, 120, 90, 60, 0, 210] as const;
// New turntable sprites: 000 front, then the nose turns toward the viewer's
// left (clockwise from above): 090 = left side, 180 = back, 270 = right side.
// Screen semantics: up-screen travel shows the back (180), down-screen the
// front (000), rightward travel the right side (270).
const TURNTABLE_VEHICLE_VIEWS = [180, 210, 270, 300, 0, 60, 90, 150] as const;
const TURNTABLE_KINDS: readonly string[] = [
  "subway", "s-bahn", "ferry", "rail", "metro", "isap", "athens_bus", "blue_star",
];

export const vehicleKindViewAngle = (kind: string, travelBearing: number, cameraHeading = 0) => {
  const views = TURNTABLE_KINDS.includes(kind)
    ? TURNTABLE_VEHICLE_VIEWS : VEHICLE_SCREEN_VIEWS;
  return views[Math.round(normalizeAngle(travelBearing - cameraHeading) / 45) % 8];
};
export const vehicleMobilityViewAngle = (travelBearing: number, cameraHeading = 0) =>
  VEHICLE_SCREEN_VIEWS[Math.round(normalizeAngle(travelBearing - cameraHeading) / 45) % 8];

// Legacy shelter calibration: looking along the street axis exposes a side.
const STOP_AXIS_VIEWS = [150, 120, 0, 30, 240, 210, 180, 330] as const;
// New stop turntables (000 front, 090 side, 180 back, 270 other side):
// same viewer logic — along the street axis shows a side, the opposite
// approach shows the other side.
const TURNTABLE_STOP_VIEWS = [90, 60, 0, 330, 270, 240, 180, 210] as const;
const TURNTABLE_STOP_KINDS: readonly string[] = [
  "athens_bus_stop", "athens_isap_stop", "athens_metro_stop",
  "berlin_u_bahn_stop", "berlin_s_bahn_stop",
];

export function stopMobilityViewAngle(
  cameraHeading: number,
  geometryBearing = 0,
  viewerBearing?: number,
  side?: string | null,
  kind: MobilityViewKind = "bus_stop",
): number {
  const relative = (viewerBearing ?? 0) - geometryBearing - cameraHeading + (side === "right" ? 180 : 0);
  const views = TURNTABLE_STOP_KINDS.includes(kind) ? TURNTABLE_STOP_VIEWS : STOP_AXIS_VIEWS;
  return views[Math.round(normalizeAngle(relative) / 45) % 8];
}

export const vehicleMobilityView = (kind: MobilityViewKind, travelBearing: number) =>
  MOBILITY_VIEW_SOURCES[kind][vehicleKindViewAngle(kind, travelBearing)];
export const stopMobilityView = (
  cameraHeading: number,
  geometryBearing = 0,
  viewerBearing?: number,
  side?: string | null,
  kind: MobilityViewKind = "bus_stop",
) => MOBILITY_VIEW_SOURCES[kind][
  stopMobilityViewAngle(cameraHeading, geometryBearing, viewerBearing, side, kind)
];
