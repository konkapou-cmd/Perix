import { useEffect, useMemo, useState } from "react";
import type { LiveVehicle } from "../lib/api/mobility";
import { cachedMobilityNetwork, loadMobilityNetwork, missingNetworkScopes, networkScope, networkRefreshDelay,
  NETWORK_REFRESH_MS, NETWORK_SCOPE_RETRY_MS } from "../lib/mobilityNetwork";

/** Refresh on scope/data lifetime, not camera movement. Retain valid data on errors. */
export function useMobilityNetwork(enabled: boolean, token: string | null | undefined, vehicles: LiveVehicle[]) {
  const [map, setMap] = useState(cachedMobilityNetwork);
  const [failed, setFailed] = useState(false);
  const scopeKey = useMemo(() => JSON.stringify([...new Set(vehicles
    .filter(v => v.mode !== "taxi" && !!v.pattern_id && !!v.network_version_id && !!v.service_date).map(networkScope))].sort()), [vehicles]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry = 2000;
    const scopes: string[] = JSON.parse(scopeKey);
    const load = async () => {
      let delay = NETWORK_REFRESH_MS;
      try {
        const next = await loadMobilityNetwork(token, scopes);
        if (cancelled) return;
        setMap(next); setFailed(false); retry = 2000;
        delay = missingNetworkScopes(next, scopes) ? NETWORK_SCOPE_RETRY_MS : networkRefreshDelay();
      } catch {
        if (cancelled) return;
        setFailed(true); delay = retry; retry = Math.min(retry * 2, 30000);
      } finally {
        if (!cancelled) timer = setTimeout(load, delay);
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, token, scopeKey]);
  return { map, failed };
}
