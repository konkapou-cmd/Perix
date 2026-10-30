import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocation } from "../context/LocationContext";
import { JourneyPlan, planJourney } from "../lib/api/mobility";

export function useDestinationJourney(latitude: number, longitude: number) {
  const { sessionToken } = useAuth();
  const { mapPosition, locationMode, selectionRevision, useLiveLocation: requestLiveLocation } = useLocation();
  const [anchor, setAnchor] = useState<{ position: { latitude: number; longitude: number }; choice: number } | null>(null);
  const origin = mapPosition ? (anchor?.choice === selectionRevision ? anchor.position : mapPosition) : null;
  const choiceRef = useRef(selectionRevision);
  choiceRef.current = selectionRevision;
  const [result, setResult] = useState<{ key: string; plan: JourneyPlan | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Explicit manual/live choice wins immediately. Capture live origin once
  // per choice so ordinary GPS ticks do not continuously request new plans.
  useEffect(() => {
    if (mapPosition && anchor?.choice !== selectionRevision) setAnchor({ position: mapPosition, choice: selectionRevision });
  }, [mapPosition, selectionRevision, anchor]);
  const key = `${latitude}:${longitude}:${origin?.latitude}:${origin?.longitude}:${selectionRevision}:${revision}`;
  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    planJourney(sessionToken, origin.latitude, origin.longitude, latitude, longitude)
      .then(response => { if (!cancelled) setResult({ key, plan: response.itineraries?.[0] || null }); })
      .catch(() => { if (!cancelled) { setFailed(true); setResult({ key, plan: null }); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key, origin, latitude, longitude, sessionToken]);
  const refresh = async () => {
    if (locating) return;
    if (locationMode === "manual" && origin) { setRevision(n => n + 1); return; }
    setLocating(true);
    const choice = selectionRevision;
    try {
      const fix = await requestLiveLocation(); // Permission request only after a gesture.
      if (!mounted.current) return;
      if (!fix && choiceRef.current === choice) setFailed(true);
    } catch { if (mounted.current) setFailed(true); }
    finally { if (mounted.current) setLocating(false); }
  };
  return { origin, plan: result?.key === key ? result.plan : null,
    originSource: locationMode, originName: mapPosition?.name,
    loading, locating, failed, refresh, resolved: result?.key === key };
}
