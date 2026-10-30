import type { JourneyPlan } from "./api/mobility";

export function journeyPlanLines(plan?: JourneyPlan | null) {
  const colors: Record<string, string> = { tram: "#166534", bus: "#1E3A8A" };
  return (plan?.legs || []).map((leg, index) => ({ segmentId: `leg-${index}`,
    points: (leg.points || []).every(p => Array.isArray(p) && p.length === 2
      && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)
      ? (leg.points as number[][] || []).map(p => ({ latitude: p[0], longitude: p[1] })) : [],
    color: leg.type === "ride" ? colors[leg.mode || "bus"] || colors.bus : "#59ABE3",
    weight: leg.type === "ride" ? 6 : 5, opacity: 0.9,
  })).filter(line => line.points.length >= 2);
}

export function journeyViewport(points: { latitude: number; longitude: number }[]) {
  const valid = points.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  if (!valid.length) return null;
  const lats = valid.map(p => p.latitude), lngs = valid.map(p => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.006, (maxLat - minLat) * 1.3),
    longitudeDelta: Math.max(0.006, (maxLng - minLng) * 1.3) };
}
