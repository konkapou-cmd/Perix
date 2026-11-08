/** A separate bounded-RTT HTTPS clock sample; never a source forecast or GPS. */
export type ServerClock = { serverMs: number; monotonicMs: number; uncertaintyMs: number };
export function captureServerClock(response: { server_received_at_ms: number; server_sent_at_ms: number },
  requestedMonotonicMs: number, receivedMonotonicMs: number): ServerClock | null {
  const {server_received_at_ms:received,server_sent_at_ms:sent}=response;
  if (![received,sent,requestedMonotonicMs,receivedMonotonicMs].every(Number.isFinite)
      || sent<received || receivedMonotonicMs<requestedMonotonicMs) return null;
  const network=receivedMonotonicMs-requestedMonotonicMs-(sent-received);
  if (network< -5 || network>500) return null;
  return {serverMs:sent+Math.max(0,network)/2,monotonicMs:receivedMonotonicMs,
    uncertaintyMs:Math.max(0,network)/2};
}
export function sampleServerClock(clock: ServerClock | null, monotonicMs: number) {
  if (!clock || !Number.isFinite(monotonicMs) || monotonicMs<clock.monotonicMs
      || monotonicMs-clock.monotonicMs>120000) return null;
  return {serverMs:clock.serverMs+monotonicMs-clock.monotonicMs,
    uncertaintyMs:clock.uncertaintyMs,calibratedMonotonicMs:clock.monotonicMs};
}

/** Seconds are derived from the accepted target/receipt, never a decrementing timer. */
export type CountdownRow = { countdown_event?: string; display_countdown_seconds?: number | null;
  display_eta_seconds?: number | null; eta_minutes?: number; client_received_monotonic_ms?: number;
  countdown_target_at_ms?: number | null; countdown_deadline_monotonic_ms?: number | null };
export function remainingCountdownSeconds(row: CountdownRow, monotonicMs: number) {
  if (row.countdown_event === 'WAITING_FOR_SOURCE_UPDATE') return null;
  if (Number.isFinite(row.countdown_deadline_monotonic_ms)) {
    const now = Math.max(monotonicMs,row.client_received_monotonic_ms ?? monotonicMs);
    return Math.max(0,(row.countdown_deadline_monotonic_ms!-now)/1000);
  }
  const value = row.display_countdown_seconds ?? row.display_eta_seconds ?? (row.eta_minutes == null ? null : row.eta_minutes*60);
  if (value == null || !Number.isFinite(value)) return null;
  const elapsed = row.client_received_monotonic_ms == null ? 0 : Math.max(0,monotonicMs-row.client_received_monotonic_ms)/1000;
  return Math.max(0,value-elapsed);
}

export function formatCountdown(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const total = Math.max(0,Math.ceil(seconds));
  return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
}

export function departureRefreshKey(row: CountdownRow & { vehicle_id: string }, monotonicMs: number) {
  if (row.countdown_event !== 'DEPARTURE' || !Number.isFinite(row.countdown_target_at_ms)) return null;
  return remainingCountdownSeconds(row,monotonicMs) === 0 ? `${row.vehicle_id}|${row.countdown_target_at_ms}` : null;
}

/** Display the last accepted finite clock to zero, not a new source forecast.
 * After five seconds at zero the completed row leaves the list. This UI grace
 * does NOT release conditional waits or extend marker/source authorization. */
export function countdownPresentation(row: CountdownRow, monotonicMs: number) {
  const age = row.client_received_monotonic_ms == null ? 0
    : Math.max(0, monotonicMs-row.client_received_monotonic_ms)/1000;
  const seconds = remainingCountdownSeconds(row, monotonicMs);
  const finiteTarget = row.countdown_event !== 'WAITING_FOR_SOURCE_UPDATE'
    && Number.isFinite(row.countdown_target_at_ms)
    && (Number.isFinite(row.countdown_deadline_monotonic_ms) || (Number.isFinite(row.display_countdown_seconds)
      && Number.isFinite(row.client_received_monotonic_ms)));
  const signedRemaining = Number.isFinite(row.countdown_deadline_monotonic_ms)
    ? (row.countdown_deadline_monotonic_ms!-Math.max(monotonicMs,row.client_received_monotonic_ms ?? monotonicMs))/1000
    : Math.max(0,row.display_countdown_seconds || 0)-age;
  const stale = age > 30;
  return { seconds, stale, completed: finiteTarget && seconds === 0,
    visible: finiteTarget ? signedRemaining >= -5 : !stale };
}
