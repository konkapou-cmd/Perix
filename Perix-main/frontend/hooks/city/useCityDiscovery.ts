import { useCallback, useEffect, useRef, useState } from "react";
import { DirectoryEntity, fetchGatewayPage, GatewayQuery } from "../../lib/city/gateway";
import { CityBounds } from "../../lib/city/publicServices";

type Page = Awaited<ReturnType<typeof fetchGatewayPage>>;
const cache = new Map<string, { at: number; value: Page }>();
const pending = new Map<string, Promise<Page>>();
function read(key: string, input: { filter: GatewayQuery; bounds: CityBounds; search: string }, cursors: Record<string, string | null>, refresh = false) {
  const pageKey = key + JSON.stringify(cursors);
  const previous = cache.get(pageKey);
  if (!refresh && previous && Date.now() - previous.at < 15_000) return Promise.resolve(previous.value);
  const running = pending.get(pageKey);
  if (running) return running;
  const task = fetchGatewayPage(input.filter, input.bounds, input.search, cursors).then(value => {
    if (cache.size >= 24) cache.delete(cache.keys().next().value!);
    cache.set(pageKey, { at: Date.now(), value }); return value;
  }).finally(() => pending.delete(pageKey));
  pending.set(pageKey, task); return task;
}

export function useCityDiscovery(filter: GatewayQuery, bounds: CityBounds, search: string) {
  const key = JSON.stringify({ filter, bounds, search });
  const active = useRef(key); active.current = key;
  const revision = useRef(0);
  const mounted = useRef(false);
  const busy = useRef(false);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ key: string; items: DirectoryEntity[]; cursors: Record<string, string | null>; partial: boolean }>({ key: "", items: [], cursors: {}, partial: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    const request = ++revision.current;
    busy.current = true;
    setLoading(true); setError(null);
    const accepts = () => !cancelled && request === revision.current && active.current === key;
    const timer = setTimeout(() => {
      read(key, JSON.parse(key), {}, version > 0).then(page => {
        if (accepts()) setState({ key, ...page });
      }).catch(() => { if (accepts()) setError("loadError"); })
        .finally(() => { if (accepts()) { busy.current = false; setLoading(false); } });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, version]);
  const more = useCallback(async () => {
    if (busy.current || state.key !== key || !Object.values(state.cursors).some(Boolean)) return;
    const request = ++revision.current;
    const accepts = () => mounted.current && request === revision.current && active.current === key;
    busy.current = true; setLoading(true); setError(null);
    try {
      const page = await read(key, JSON.parse(key), state.cursors);
      if (accepts()) setState(prev => ({ key, ...page, items: [...new Map([...prev.items, ...page.items].map(r => [`${r.type}:${r.id}`, r])).values()] }));
    } catch { if (accepts()) setError("moreError"); }
    finally { if (accepts()) { busy.current = false; setLoading(false); } }
  }, [key, state]);
  return { items: state.key === key ? state.items : [], loading: loading || state.key !== key && !error,
    partial: state.key === key && state.partial, error, more,
    hasMore: state.key === key && Object.values(state.cursors).some(Boolean), retry: () => setVersion(v => v + 1) };
}
