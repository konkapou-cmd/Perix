import type { JourneyPlan } from "../api/mobility";

/** Presentation of the existing planner's geometry, not a second route engine. */
export function journeyPlanLines(plan?: JourneyPlan) {
  return (plan?.legs || []).map(leg => ({
    points: (leg.points || []).filter((p): p is number[] => Array.isArray(p) && p.length === 2
      && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)
      .map(p => ({ latitude: p[0], longitude: p[1] })),
    color: leg.type !== "ride" ? "#59ABE3" : leg.mode === "tram" ? "#166534" : "#1E3A8A",
    weight: leg.type === "ride" ? 6 : 5, opacity: 0.9,
  })).filter(line => line.points.length >= 2);
}
