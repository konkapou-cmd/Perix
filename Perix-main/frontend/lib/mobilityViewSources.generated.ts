// Generated static 128px transparent map-view assets from Perix-Mobility-360-Icons.
import type { ImageSourcePropType } from "react-native";

export type MobilityViewKind = "bus" | "tram" | "bus_stop";
export const MOBILITY_VIEW_SOURCES: Record<MobilityViewKind, Record<number, ImageSourcePropType>> = {
  bus: {
    0: require("../assets/mobility-views/bus/000.png"),
    30: require("../assets/mobility-views/bus/030.png"),
    60: require("../assets/mobility-views/bus/060.png"),
    90: require("../assets/mobility-views/bus/090.png"),
    120: require("../assets/mobility-views/bus/120.png"),
    150: require("../assets/mobility-views/bus/150.png"),
    180: require("../assets/mobility-views/bus/180.png"),
    210: require("../assets/mobility-views/bus/210.png"),
    240: require("../assets/mobility-views/bus/240.png"),
    270: require("../assets/mobility-views/bus/270.png"),
    300: require("../assets/mobility-views/bus/300.png"),
    330: require("../assets/mobility-views/bus/330.png"),
  },
  tram: {
    0: require("../assets/mobility-views/tram/000.png"),
    30: require("../assets/mobility-views/tram/030.png"),
    60: require("../assets/mobility-views/tram/060.png"),
    90: require("../assets/mobility-views/tram/090.png"),
    120: require("../assets/mobility-views/tram/120.png"),
    150: require("../assets/mobility-views/tram/150.png"),
    180: require("../assets/mobility-views/tram/180.png"),
    210: require("../assets/mobility-views/tram/210.png"),
    240: require("../assets/mobility-views/tram/240.png"),
    270: require("../assets/mobility-views/tram/270.png"),
    300: require("../assets/mobility-views/tram/300.png"),
    330: require("../assets/mobility-views/tram/330.png"),
  },
  bus_stop: {
    0: require("../assets/mobility-views/bus_stop/000.png"),
    30: require("../assets/mobility-views/bus_stop/030.png"),
    60: require("../assets/mobility-views/bus_stop/060.png"),
    90: require("../assets/mobility-views/bus_stop/090.png"),
    120: require("../assets/mobility-views/bus_stop/120.png"),
    150: require("../assets/mobility-views/bus_stop/150.png"),
    180: require("../assets/mobility-views/bus_stop/180.png"),
    210: require("../assets/mobility-views/bus_stop/210.png"),
    240: require("../assets/mobility-views/bus_stop/240.png"),
    270: require("../assets/mobility-views/bus_stop/270.png"),
    300: require("../assets/mobility-views/bus_stop/300.png"),
    330: require("../assets/mobility-views/bus_stop/330.png"),
  },
};

const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;
export function nearestMobilityViewAngle(angle: number): number {
  const normalized = normalizeAngle(Number.isFinite(angle) ? angle : 0);
  return Math.round(normalized / 30) * 30 % 360;
}
// The sprite views are camera-facing: a northbound vehicle exposes its rear to a north-up map viewer.
export const vehicleMobilityViewAngle = (travelBearing: number) => nearestMobilityViewAngle(normalizeAngle(travelBearing + 180));
// Fixed stops select a view from the current map camera heading, not a PNG rotation.
export const stopMobilityViewAngle = (cameraHeading: number) => nearestMobilityViewAngle(cameraHeading);
export const vehicleMobilityView = (kind: "bus" | "tram", travelBearing: number) => MOBILITY_VIEW_SOURCES[kind][vehicleMobilityViewAngle(travelBearing)];
export const stopMobilityView = (cameraHeading: number) => MOBILITY_VIEW_SOURCES.bus_stop[stopMobilityViewAngle(cameraHeading)];
