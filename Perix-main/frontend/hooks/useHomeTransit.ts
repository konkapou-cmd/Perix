import { useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { getLiveVehicles, LiveVehicle } from "../lib/api/mobility";
import { transitMarkerId } from "../lib/navigation/mobilityRoutes";
import { useMobilityNetwork } from "./useMobilityNetwork";
import { canonicalVehicleLine } from "../lib/mobilityNetwork";

/** Passenger API only: no new position model, viewport writes or paid routing. */
export function useHomeTransit() {
  const focused = useIsFocused();
  const { sessionToken } = useAuth();
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [visible, setVisible] = useState(true);
  const network = useMobilityNetwork(focused && visible, sessionToken, vehicles);
  const lines = network.map?.lines;
  useEffect(() => {
    if (Platform.OS === "web") {
      const update = () => setVisible(document.visibilityState !== "hidden");
      update();
      document.addEventListener("visibilitychange", update);
      return () => document.removeEventListener("visibilitychange", update);
    }
    setVisible(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", state => setVisible(state === "active"));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!focused || !visible) { setVehicles([]); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const fleet = await getLiveVehicles(sessionToken); // baseline, never google_locator
        if (cancelled) return;
        setVehicles(fleet.filter(v => v.mode === "bus" || v.mode === "tram"));
        clearTimeout(expiry);
        expiry = setTimeout(() => { if (!cancelled) setVehicles([]); }, 30000);
      } catch {
        // Last sample expires rather than leaving stale vehicles indefinitely.
      } finally {
        if (!cancelled) timer = setTimeout(load, 4000);
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(expiry); };
  }, [focused, visible, sessionToken]);
  const markers = useMemo(() => vehicles
    .filter(v => Number.isFinite(v.latitude) && Number.isFinite(v.longitude))
    .map(v => {
      const line = canonicalVehicleLine(lines || [], v);
      return { id: transitMarkerId(v.vehicle_id), journeyId: v.trip_instance_id || v.trip_id,
        latitude: v.latitude!, longitude: v.longitude!, type: v.mode as "bus" | "tram",
        title: `${v.display_route_number || v.route_number || ""} → ${v.route_direction || ""}`,
        label: v.display_route_number || v.route_number, estimated: v.estimated,
        heading: v.heading, speed: v.speed, motionState: v.motion?.state,
        progressM: v.progress_m, positionState: v.position_state,
        // Never use a same-route/opposite-direction or ambiguous dated path.
        path: line?.points };
    }), [vehicles, lines]);
  return { vehicles, markers };
}
