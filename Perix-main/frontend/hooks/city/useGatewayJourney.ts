import { useCallback, useEffect, useState } from "react";
import { planJourney, JourneyPlan } from "../../lib/api/mobility";

type Point = { latitude: number; longitude: number };
type Origin = Point & { kind?: "live" | "manual"; name?: string };
export type JourneyDestination = Point & { id: string; title: string };
export type GatewayJourneyState = {
  status: "idle" | "location" | "loading" | "ready" | "empty" | "error";
  plan?: JourneyPlan;
  note?: string;
  origin?: Origin;
};

export function useGatewayJourney(destination: JourneyDestination | null, livePosition: Origin | null) {
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  const [result, setResult] = useState<GatewayJourneyState & { key: string }>({ key: "", status: "idle" });
  const hasOrigin = !!livePosition && Number.isFinite(livePosition.latitude) && Number.isFinite(livePosition.longitude);
  const manual = livePosition?.kind === "manual";
  const key = destination ? JSON.stringify([destination.id, destination.latitude, destination.longitude, hasOrigin,
    manual,manual ? livePosition?.latitude : null,manual ? livePosition?.longitude : null,revision]) : "";
  useEffect(() => {
    if (!destination || !hasOrigin || !livePosition) return;
    let active = true;
    // Snapshot the actual live origin at selection/retry. Ordinary GPS ticks and
    // camera pans must not repeatedly replace an itinerary while it is read.
    const origin = { latitude: livePosition.latitude, longitude: livePosition.longitude,kind:livePosition.kind,name:livePosition.name };
    setResult({ key, status: "loading", origin });
    planJourney(null, origin.latitude, origin.longitude, destination.latitude, destination.longitude).then(response => {
      if (!active) return;
      const plan = response.itineraries?.[0];
      setResult({ key, origin, status: plan ? "ready" : "empty", plan, note: response.note });
    }).catch(() => { if (active) setResult({ key, origin, status: "error" }); });
    return () => { active = false; };
    // The request key deliberately excludes moving GPS coordinates; retry uses
    // the latest fix. Losing/regaining location does invalidate the old plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const state: GatewayJourneyState = !destination ? { status: "idle" }
    : !hasOrigin ? { status: "location" }
    : result.key !== key ? { status: "loading" } : result;
  return { ...state, retry };
}
