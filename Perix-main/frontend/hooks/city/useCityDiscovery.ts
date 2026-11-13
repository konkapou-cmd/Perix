import { useCallback, useEffect, useRef, useState } from "react";
import { DirectoryEntity, fetchGatewayPage, GatewayQuery, DirectoryCity } from "../../lib/city/gateway";
import { CityBounds } from "../../lib/city/publicServices";

type Page = Awaited<ReturnType<typeof fetchGatewayPage>>;
const cache = new Map<string, { at: number; value: Page }>();
const pending = new Map<string, Promise<Page>>();
type Snapshot = { key: string; items: DirectoryEntity[]; cursors: Record<string, string | null>; partial: boolean };
const snapshots = new Map<string, Snapshot>();
function remember(snapshot: Snapshot) {
  if (!snapshots.has(snapshot.key) && snapshots.size >= 24) snapshots.delete(snapshots.keys().next().value!);
  snapshots.set(snapshot.key, snapshot);
  return snapshot;
}
function read(key: string, input: { filter: GatewayQuery; bounds: CityBounds; search: string; includeMobility: boolean; cities: DirectoryCity[] }, cursors: Record<string, string | null>, refresh = false) {
  const pageKey = key + JSON.stringify(cursors);
  const previous = cache.get(pageKey);
  if (!refresh && previous) return Promise.resolve(previous.value);
  const running = pending.get(pageKey);
  if (running) return running;
  const task = fetchGatewayPage(input.filter, input.bounds, input.search, cursors, input.includeMobility, input.cities).then(value => {
    if (cache.size >= 24) cache.delete(cache.keys().next().value!);
    cache.set(pageKey, { at: Date.now(), value }); return value;
  }).finally(() => pending.delete(pageKey));
  pending.set(pageKey, task); return task;
}

const HOME_CITIES: DirectoryCity[] = [{ countryCode: "DE", cityId: "de-magdeburg" }];

export function useCityDiscovery(filter: GatewayQuery, bounds: CityBounds, search: string, includeMobility = true, enabled = true, cities: DirectoryCity[] = HOME_CITIES) {
  const key = JSON.stringify({ filter, bounds, search, includeMobility, cities });
  const active = useRef(key); active.current = key;
  const revision = useRef(0);
  const mounted = useRef(false);
  const busy = useRef(false);
  const refreshKeys = useRef(new Set<string>());
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<Snapshot>({ key: "", items: [], cursors: {}, partial: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!enabled) { busy.current = false; setLoading(false); setError(null); return; }
    const refresh = refreshKeys.current.delete(key);
    if(refresh){
      snapshots.delete(key);
      for(const pageKey of cache.keys())if(pageKey.startsWith(key))cache.delete(pageKey);
    }
    const saved = snapshots.get(key);
    if (saved && !refresh) { setState(saved); setLoading(false); setError(null); busy.current = false; return; }
    let cancelled = false;
    const request = ++revision.current;
    busy.current = true;
    setLoading(true); setError(null);
    const accepts = () => !cancelled && request === revision.current && active.current === key;
    const timer = setTimeout(() => {
      read(key, JSON.parse(key), {}, refresh).then(page => {
        if (accepts()) setState(remember({ key, ...page }));
      }).catch(() => { if (accepts()) setError("loadError"); })
        .finally(() => { if (accepts()) { busy.current = false; setLoading(false); } });
    }, 0); // Fixed scene scope: no drag/zoom debounce is needed anymore.
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, version, enabled]);
  const more = useCallback(async () => {
    if (!enabled || busy.current || state.key !== key || !Object.values(state.cursors).some(Boolean)) return;
    const request = ++revision.current;
    const accepts = () => mounted.current && request === revision.current && active.current === key;
    busy.current = true; setLoading(true); setError(null);
    try {
      const page = await read(key, JSON.parse(key), state.cursors);
      if (accepts()) setState(prev => remember({ key, ...page, items: [...new Map([...prev.items, ...page.items].map(r => [`${r.type}:${r.id}`, r])).values()] }));
    } catch { if (accepts()) setError("moreError"); }
    finally { if (accepts()) { busy.current = false; setLoading(false); } }
  }, [key, state, enabled]);
  const visible = state.key === key ? state : snapshots.get(key);
  return { items: enabled ? visible?.items || [] : [], loading: enabled && (!visible && !error || loading && state.key === key),
    partial: !!visible?.partial, error, more,
    hasMore: !!visible && Object.values(visible.cursors).some(Boolean), retry: () => { refreshKeys.current.add(key); setVersion(v => v + 1); } };
}
