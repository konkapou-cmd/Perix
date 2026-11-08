import type { MotionPreview } from "../api/mobility";

const refreshListeners = new Set<() => void>();
let lastRefreshSignal = -Infinity;
export function subscribeVisualRefresh(refresh: () => void) {
  refreshListeners.add(refresh);
  const visible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visible);
  return () => {
    refreshListeners.delete(refresh);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visible);
  };
}
export function requestVisualRefresh(monotonicMs: number) {
  if (!refreshListeners.size || monotonicMs-lastRefreshSignal < 2000) return;
  lastRefreshSignal = monotonicMs;
  refreshListeners.forEach(refresh => refresh());
}

/** Local diagnostics only. Navigation time is NEVER added to trajectory age. */
export function measureVisualApplication(active: ActivePreview, appliedMonotonicMs: number, mapReadyMonotonicMs?: number) {
  const p = active.preview;
  const serverMs = active.serverMs+appliedMonotonicMs-active.monotonicMs;
  return {
    navigation_started_monotonic_ms: p.client_navigation_started_monotonic_ms ?? 0,
    request_started_monotonic_ms: p.client_request_started_monotonic_ms,
    response_received_monotonic_ms: p.client_received_monotonic_ms,
    map_ready_monotonic_ms: mapReadyMonotonicMs,
    pin_applied_monotonic_ms: appliedMonotonicMs,
    page_to_pin_applied_ms: appliedMonotonicMs-(p.client_navigation_started_monotonic_ms ?? 0),
    sample_age_at_apply_ms: serverMs-p.sampled_at_ms,
    published_coverage_ms: p.valid_until_ms-p.sampled_at_ms,
    coverage_remaining_ms: p.valid_until_ms-serverMs,
    coverage_end_reason: p.coverage_end_reason,
  };
}

type Handover = { monotonicMs: number; duration: number;
  relativeUnitMps?: number;
  relativeUnitStartMps?: number;
  relativeUnitRampS?: number;
  phases: { t0: number; t1: number; p0: number; v0: number; a: number }[] };
export type ActivePreview = { preview: MotionPreview; serverMs: number; monotonicMs: number; handover?: Handover };
type PreviewIdentity = {
  estimated: boolean; mode?: string; journeyId?: string | null; patternId?: string | null;
  planRevision?: string | null; progressM?: number | null; pathLengthM: number; geometryFingerprint?: string | null;
  nextTimelineIndex?: number | null; distanceToNextStopM?: number | null; nextStopEtaSeconds?: number | null;
};

/** Fail closed unless the exact dated journey, pattern and revision agree. */
export function authorizePreview(preview: MotionPreview | null | undefined, identity: PreviewIdentity,
  wallMs: number, monotonicMs: number): ActivePreview | null {
  const p = preview;
  if (!identity.estimated || !["bus", "tram"].includes(identity.mode || "") || !p
      || !(p.schema === 1 || (p.schema === 2 && p.semantics === "TIME_NORMALIZED_VISUAL_ESTIMATE"
        && p.physical_speed_assurance === false))
      || !identity.journeyId || p.journey_id !== identity.journeyId || !identity.planRevision
      || p.revision !== identity.planRevision || !identity.patternId || p.pattern_id !== identity.patternId
      || !identity.geometryFingerprint || p.approach_geometry_fingerprint !== identity.geometryFingerprint
      || !Number.isFinite(identity.progressM) || !Number.isFinite(identity.pathLengthM) || identity.pathLengthM <= 0
      || !Number.isInteger(identity.nextTimelineIndex) || p.stop_occurrence_index !== identity.nextTimelineIndex
      || !Number.isFinite(identity.distanceToNextStopM) || !Number.isFinite(p.stop_progress_m)
      || Math.abs((identity.progressM as number) + (identity.distanceToNextStopM as number) - p.stop_progress_m) > 0.25
      || !Number.isFinite(identity.nextStopEtaSeconds) || !Number.isFinite(p.effective_arrival_at_ms)
      || Math.abs(Math.max(0, Math.ceil((p.effective_arrival_at_ms - p.sampled_at_ms) / 1000))
          - (identity.nextStopEtaSeconds as number)) > 1
      || !Array.isArray(p.phases) || p.phases.length < 1 || p.phases.length > (p.schema === 2 ? 128 : 32)) return null;
  const values = [wallMs, monotonicMs, p.sampled_at_ms, p.valid_until_ms, p.server_received_at_ms,
    p.server_sent_at_ms, p.client_request_at_ms, p.client_received_at_ms];
  if (!values.every(Number.isFinite)) return null;
  const occurrences = p.stop_progress_by_occurrence_m;
  const occurrenceAware = p.schema === 2 && ['station-relative-v1','station-cycle-v2'].includes(p.visual_rule_version || '');
  const stationCycle = p.visual_rule_version === 'station-cycle-v2';
  // Old packets without an explicit lead retain their historical 10s contract.
  // Current packets declare 30s: reject a moving-at-0:30 plan under that policy.
  const stationStopLeadMs = (p.visual_parameters?.station_stop_lead_s ?? 10)*1000;
  if (stationCycle && (!Number.isFinite(stationStopLeadMs) || stationStopLeadMs < 10000)) return null;
  if (p.visual_rule_version && !occurrenceAware) return null;
  if (occurrenceAware && (!Array.isArray(occurrences) || occurrences.length < 2
      || p.stop_occurrence_index < 0 || p.stop_occurrence_index >= occurrences.length
      || occurrences.some((value, i) => !Number.isFinite(value) || value < 0 || value > identity.pathLengthM+0.1
        || (i > 0 && value <= occurrences[i-1]))
      || Math.abs(occurrences[p.stop_occurrence_index]-p.stop_progress_m)>0.1
      || !p.visual_parameters || !Number.isFinite(p.visual_parameters.handover_min_ramp_s)
      || p.visual_parameters.handover_min_ramp_s < 2
      || !Number.isFinite(p.visual_parameters.relative_motion_rate_per_s)
      || p.visual_parameters.relative_motion_rate_per_s <= 0)) return null;
  const work = p.server_sent_at_ms - p.server_received_at_ms;
  const network = p.client_received_at_ms - p.client_request_at_ms - work;
  const capturedClock = p.schema === 2 && p.client_received_monotonic_ms != null;
  if (capturedClock && !Number.isFinite(p.client_received_monotonic_ms)) return null;
  const bridgeAge = capturedClock ? monotonicMs-p.client_received_monotonic_ms! : wallMs-p.client_received_at_ms;
  const synchronized = capturedClock && p.client_server_clock_at_receive_ms != null;
  if (synchronized && (![p.client_server_clock_at_receive_ms,p.client_clock_uncertainty_ms,
      p.client_clock_calibrated_monotonic_ms].every(Number.isFinite)
      || p.client_clock_uncertainty_ms!<0 || p.client_clock_uncertainty_ms!>250
      || monotonicMs<p.client_clock_calibrated_monotonic_ms!
      || monotonicMs-p.client_clock_calibrated_monotonic_ms!>120000)) return null;
  if (work < 0 || (!synchronized && (network < -5 || network > 500)) || bridgeAge < 0 || (!capturedClock && bridgeAge > 1000)
      || p.sampled_at_ms > p.server_sent_at_ms || p.valid_until_ms <= p.sampled_at_ms) return null;
  let end = 0, progress = identity.progressM as number, occurrence = p.stop_occurrence_index;
  if (stationCycle && (!Array.isArray(p.station_window) || p.station_window.length < 1 || p.station_window.length > 3)) return null;
  if (stationCycle) {
    const window = p.station_window!;
    const start = window[0].stop_occurrence_index;
    if (![p.stop_occurrence_index,Math.max(0,p.stop_occurrence_index-1)].includes(start)
        || window.length !== Math.min(3,occurrences!.length-start)
        || window.some((c,i) => c.stop_occurrence_index !== start+i || !c.stop_id
          || ![c.modeled_arrival_at_ms,c.modeled_departure_at_ms,c.approach_started_at_ms].every(Number.isFinite)
           || c.modeled_arrival_at_ms > c.modeled_departure_at_ms
           || (!c.cycle_limited && c.modeled_departure_at_ms-c.modeled_arrival_at_ms < stationStopLeadMs-1)
          || (i > 0 && c.incoming_leg_available && c.modeled_arrival_at_ms <= window[i-1].modeled_departure_at_ms))) return null;
  }
  let prior: MotionPreview['phases'][number] | undefined;
  for (const phase of p.phases) {
    if (![phase.t0, phase.t1, phase.p0, phase.p1, phase.v0, phase.a].every(Number.isFinite)
        || Math.abs(phase.t0 - end) > 1e-5 || phase.t1 <= phase.t0 || phase.t1 > (p.schema === 2 ? 45.001 : 8.001)
        || Math.abs(phase.p0 - progress) > 0.15 || phase.p0 < 0 || phase.p1 < phase.p0
         || phase.p1 > identity.pathLengthM + 0.1 || phase.v0 < -1e-6) return null;
    if (occurrenceAware) {
      const index = phase.stop_occurrence_index;
      if (!Number.isInteger(index) || index! < occurrence || index! > occurrence+1
          || index! < 0 || index! >= occurrences!.length
          || ![phase.start_progress_m,phase.stop_progress_m,phase.effective_arrival_at_ms,
              phase.relative_motion_level0,phase.relative_motion_level1].every(Number.isFinite)
          || Math.abs(phase.stop_progress_m!-occurrences![index!])>0.1
          || phase.start_progress_m! < (index! > 0 ? occurrences![index!-1] : 0)-0.1
          || phase.p0 < phase.start_progress_m!-0.1 || phase.p1 > phase.stop_progress_m!+0.1
          || phase.relative_motion_level0! < -1e-6 || phase.relative_motion_level1! < -1e-6
          || phase.relative_motion_level0! > 6.001 || phase.relative_motion_level1! > 6.001) return null;
      if (index !== occurrence && (Math.abs((prior?.p1 ?? progress)-occurrences![occurrence])>0.1
          || Math.abs(phase.start_progress_m!-occurrences![occurrence])>0.1)) return null;
      if (phase.state === 'VISUAL_STOP_ESTIMATE') {
        if (Math.abs(phase.p0-phase.stop_progress_m!)>0.1 || phase.v0 !== 0 || phase.a !== 0
            || phase.relative_motion_level0 !== 0 || phase.relative_motion_level1 !== 0) return null;
      } else if (phase.state !== 'VISUAL_MOVING'
          || phase.t1*1000+p.sampled_at_ms > phase.effective_arrival_at_ms!+0.1) return null;
      if (stationCycle) {
        const c = phase.station_cycle;
        if (!c || c.stop_occurrence_index !== index || !c.stop_id
            || ![c.modeled_arrival_at_ms,c.modeled_departure_at_ms,c.approach_started_at_ms].every(Number.isFinite)
            || c.modeled_arrival_at_ms > c.modeled_departure_at_ms
            || c.approach_started_at_ms > c.modeled_arrival_at_ms
             || (!c.cycle_limited && c.modeled_departure_at_ms-c.modeled_arrival_at_ms < stationStopLeadMs-1)
            || !['KNOWN_DEPARTURE','RELEVANT_SOURCE_UPDATE'].includes(c.release_condition)
            || (c.release_condition === 'RELEVANT_SOURCE_UPDATE') !== (c.countdown_event === 'WAITING_FOR_SOURCE_UPDATE')
            || (c.countdown_event === 'DEPARTURE' ? c.countdown_target_at_ms !== c.modeled_departure_at_ms
              : c.countdown_event !== 'WAITING_FOR_SOURCE_UPDATE' || c.countdown_target_at_ms !== null)) return null;
        const start = p.sampled_at_ms+phase.t0*1000, stop = p.sampled_at_ms+phase.t1*1000;
        if (phase.state === 'VISUAL_MOVING' && (!c.incoming_leg_available || stop > c.modeled_arrival_at_ms+.1)) return null;
        if (phase.state === 'VISUAL_STOP_ESTIMATE' && (!c.incoming_leg_available || !c.outgoing_leg_available
            || start < c.modeled_arrival_at_ms-.1
            || (c.release_condition === 'KNOWN_DEPARTURE' && stop > c.modeled_departure_at_ms+.1))) return null;
      }
      if (prior && Math.abs(prior.v0+prior.a*(prior.t1-prior.t0)-phase.v0)>0.01) return null;
      occurrence = index!;
    } else if (p.schema === 2 && phase.p1 > p.stop_progress_m + 0.1) return null;
    const dt = phase.t1 - phase.t0;
    const calculated = phase.p0 + phase.v0 * dt + 0.5 * phase.a * dt * dt;
    if (Math.abs(calculated - phase.p1) > 0.15 || phase.v0 + phase.a * dt < -1e-5) return null;
    end = phase.t1; progress = phase.p1;
    prior = phase;
  }
  if (Math.abs(p.valid_until_ms - p.sampled_at_ms - end * 1000) > 0.1) return null;
  const offset = ((p.server_received_at_ms - p.client_request_at_ms)
    + (p.server_sent_at_ms - p.client_received_at_ms)) / 2;
  const serverMs = synchronized ? p.client_server_clock_at_receive_ms!+bridgeAge
    : (capturedClock ? p.client_received_at_ms+bridgeAge : wallMs) + offset;
  if (serverMs < p.sampled_at_ms) return null;
  const remaining = p.valid_until_ms-serverMs;
  const initialCoverageMs = Math.max(40, p.visual_parameters?.initial_coverage_s ?? 40)*1000;
  const rollingCoverageMs = Math.max(15, p.visual_parameters?.rolling_coverage_s ?? 15)*1000;
  const fullWindow = p.schema === 2 && (p.coverage_end_reason === 'AUTHORIZED_HORIZON'
    || (!p.coverage_end_reason && p.valid_until_ms-p.sampled_at_ms >= initialCoverageMs));
  if (remaining <= 0 || (fullWindow && remaining < rollingCoverageMs)) {
    requestVisualRefresh(monotonicMs);
    return null;
  }
  return { preview: p, serverMs, monotonicMs };
}

/** Exact backend phase equation, bounded at the end of the authorized window. */
export function sampleAuthorizedPreview(active: ActivePreview, monotonicMs: number) {
  if (!Number.isFinite(monotonicMs) || monotonicMs < active.monotonicMs) return null;
  const p = active.preview;
  const serverMs = active.serverMs+monotonicMs-active.monotonicMs;
  if (serverMs >= p.valid_until_ms || (p.coverage_end_reason === 'AUTHORIZED_HORIZON'
      && p.valid_until_ms-serverMs < Math.max(15, p.visual_parameters?.rolling_coverage_s ?? 15)*1000)) {
    requestVisualRefresh(monotonicMs);
  }
  const elapsed = Math.max(0, Math.min((serverMs-p.sampled_at_ms)/1000, p.phases[p.phases.length-1].t1));
  const phase = p.phases.find(value => elapsed < value.t1) || p.phases[p.phases.length-1];
  const metadata = {
    stopOccurrenceIndex: phase.stop_occurrence_index ?? p.stop_occurrence_index,
    state: phase.state,
    stationStopId: phase.station_cycle?.stop_id,
    stationArrivalAtMs: phase.station_cycle?.modeled_arrival_at_ms,
    stationDepartureAtMs: phase.station_cycle?.countdown_target_at_ms,
    displayEtaSeconds: Math.max(0, ((phase.effective_arrival_at_ms ?? p.effective_arrival_at_ms)-serverMs)/1000),
    relativeMotionLevel: phase.relative_motion_level0 == null ? undefined : phase.relative_motion_level0
      + (phase.relative_motion_level1!-phase.relative_motion_level0)*Math.max(0,Math.min(1,(elapsed-phase.t0)/(phase.t1-phase.t0))),
    countdownEvent: phase.station_cycle?.countdown_event ?? 'ARRIVAL',
    countdownSeconds: phase.station_cycle
      ? phase.station_cycle.countdown_target_at_ms == null ? null : Math.max(0,(phase.station_cycle.countdown_target_at_ms-serverMs)/1000)
      : Math.max(0,((phase.effective_arrival_at_ms ?? p.effective_arrival_at_ms)-serverMs)/1000),
    stationCycleState: phase.station_cycle?.release_condition === 'RELEVANT_SOURCE_UPDATE' && phase.state === 'VISUAL_STOP_ESTIMATE'
      ? 'WAITING_FOR_SOURCE_UPDATE' : phase.state === 'VISUAL_STOP_ESTIMATE' ? 'DWELL'
      : phase.station_cycle && serverMs >= phase.station_cycle.approach_started_at_ms ? 'APPROACH' : 'TRAVEL',
  };
  const handover = active.handover;
  if (handover && monotonicMs < handover.monotonicMs + handover.duration * 1000) {
    const elapsed = Math.max(0, (monotonicMs-handover.monotonicMs)/1000);
    const phase = handover.phases.find(value => elapsed <= value.t1)!;
    const dt = Math.max(0, elapsed-phase.t0);
    const unit = handover.relativeUnitMps == null ? undefined
      : (handover.relativeUnitStartMps ?? handover.relativeUnitMps)
        + (handover.relativeUnitMps-(handover.relativeUnitStartMps ?? handover.relativeUnitMps))
          *Math.min(1,elapsed/(handover.relativeUnitRampS ?? handover.duration));
    return { progressM: phase.p0+phase.v0*dt+0.5*phase.a*dt*dt,
      velocityMps: Math.max(0, phase.v0+phase.a*dt), expired: false, ...metadata,
      relativeMotionLevel: unit
        ? Math.max(0, phase.v0+phase.a*dt)/unit : metadata.relativeMotionLevel };
  }
  const dt = Math.max(0, Math.min(phase.t1 - phase.t0, elapsed - phase.t0));
  return { progressM: Math.max(phase.p0, Math.min(phase.p1, phase.p0 + phase.v0 * dt + 0.5 * phase.a * dt * dt)),
    velocityMps: Math.max(0, phase.v0+phase.a*dt),
    expired: serverMs >= p.valid_until_ms, ...metadata };
}

/** Local visual handover on the SAME validated leg, not a new source forecast.
 * Positive velocity ramps match the displayed point/speed to a future point
 * on the new exact curve. No rewind, pause, clock extension or geometry gap.
 */
function bridgePreview(active: ActivePreview, progress: number, velocity: number, monotonicMs: number,
  previousRelativeLevel?: number) {
  const available = (active.preview.valid_until_ms-active.serverMs)/1000;
  const initial = sampleAuthorizedPreview(active,monotonicMs);
  const parameters = active.preview.visual_parameters;
  const minimumRamp = parameters?.handover_min_ramp_s ?? 0;
  const units = active.preview.phases.filter(p => p.stop_occurrence_index === initial?.stopOccurrenceIndex)
    .flatMap(p => [p.relative_motion_level0! > 0 ? p.v0/p.relative_motion_level0! : 0,
      p.relative_motion_level1! > 0 ? (p.v0+p.a*(p.t1-p.t0))/p.relative_motion_level1! : 0]);
  const relativeUnitMps = Math.max(0,...units);
  const relativeUnitStartMps = previousRelativeLevel != null && Number.isFinite(previousRelativeLevel)
    && previousRelativeLevel > 0 && velocity > 0 ? velocity/previousRelativeLevel : relativeUnitMps;
  for (let duration = Math.min(6, available); duration > 0.01;) {
    const target = sampleAuthorizedPreview(active, monotonicMs+duration*1000);
    if (target && !target.expired && target.stopOccurrenceIndex === initial?.stopOccurrenceIndex
        && (!parameters || (target.state === 'VISUAL_MOVING' && initial?.state === 'VISUAL_MOVING'))
        && target.progressM > progress+1e-5) {
      const distance = target.progressM-progress;
      const ramp = Math.min(duration/3, distance/(2*(velocity+target.velocityMps+1e-9)));
      const cruise = (distance-ramp*(velocity+target.velocityMps)/2)/(duration-ramp);
      let p = progress;
      const phases: Handover['phases'] = [];
      for (const [t0,t1,v0,v1] of [[0,ramp,velocity,cruise],
        [ramp,duration-ramp,cruise,cruise], [duration-ramp,duration,cruise,target.velocityMps]]) {
        const a = (v1-v0)/(t1-t0);
        phases.push({ t0,t1,p0:p,v0,a });
        p += (v0+v1)/2*(t1-t0);
      }
      const unitAt = (time: number) => relativeUnitStartMps
        + (relativeUnitMps-relativeUnitStartMps)*Math.min(1,time/ramp);
      if (ramp >= minimumRamp && cruise > 0 && phases.every(phase => {
        if (!Number.isFinite(phase.a)) return false;
        if (!parameters) return true;
        const u0 = unitAt(phase.t0), u1 = unitAt(phase.t1);
        const unitSlope = (u1-u0)/(phase.t1-phase.t0);
        const v1 = phase.v0+phase.a*(phase.t1-phase.t0);
        // d(v/u)/dt: use both endpoints, not a new constant unit that jumps
        // on a retimed source curve. No integer/half-step quantization.
        const rate = Math.abs(phase.a*u0-phase.v0*unitSlope)/Math.min(u0,u1)**2;
        return u0 > 0 && u1 > 0 && phase.v0 <= 6*u0+1e-6 && v1 <= 6*u1+1e-6
          && rate <= parameters.relative_motion_rate_per_s+1e-6;
      })) {
        active.handover = { monotonicMs, duration, phases, relativeUnitMps: relativeUnitMps || undefined,
          relativeUnitStartMps: relativeUnitStartMps || undefined, relativeUnitRampS: ramp };
        return true;
      }
    }
    if (duration >= available) break;
    duration = Math.min(available, duration*1.5);
  }
  return false;
}

export type VisualPublicationRecord = {
  authorizedPreview?: ActivePreview | null; progNow?: number | null; animStart: number | null;
  visualIdentity?: string; visualPacket?: string; visualSampledAt?: number;
  visualStopIndex?: number;
};

/** Camera/UI renders are not new publications. Keep their original time base. */
export function acceptVisualPublication(record: VisualPublicationRecord, preview: MotionPreview | null | undefined,
  identity: PreviewIdentity, publicationStatus: string | null | undefined, wallMs: number, monotonicMs: number) {
  const key = JSON.stringify([identity.journeyId,identity.patternId,identity.geometryFingerprint]);
  const same = record.visualIdentity === key;
  record.animStart = null; // Visual estimates never inherit legacy GPS extrapolation.
  const hidden = () => { record.authorizedPreview=null; record.progNow=null;
    record.visualIdentity=undefined; record.visualPacket=undefined; record.visualSampledAt=undefined; record.visualStopIndex=undefined;
    return 'hidden' as const; };
  if (publicationStatus === 'HIDDEN') return hidden();
  if (publicationStatus !== 'READY') return same ? 'held' as const : hidden();
  const packet = JSON.stringify([key,preview?.revision,preview?.sampled_at_ms]);
  if (same && (packet === record.visualPacket || (preview && record.visualSampledAt != null
      && preview.sampled_at_ms <= record.visualSampledAt))) return 'unchanged' as const;
  const next = authorizePreview(preview,identity,wallMs,monotonicMs);
  if (!next) return same ? 'held' as const : hidden();
  const current = sampleAuthorizedPreview(next,monotonicMs)!;
  if (same && record.progNow != null) {
    const previous = record.authorizedPreview && sampleAuthorizedPreview(record.authorizedPreview,monotonicMs);
    const progress = previous && !previous.expired ? previous.progressM : record.progNow;
    if (Math.abs(current.progressM-progress)>1e-5
        || (previous && !previous.expired && Math.abs(current.velocityMps-previous.velocityMps)>1e-3)) {
      // Do not blend through a stop occurrence change or a deadline already due.
      if ((previous?.stopOccurrenceIndex ?? record.visualStopIndex) === current.stopOccurrenceIndex
          && current.displayEtaSeconds>0) {
        if (!bridgePreview(next,progress,previous && !previous.expired ? previous.velocityMps : 0,monotonicMs,
            previous && !previous.expired ? previous.relativeMotionLevel : undefined)) {
          return 'held' as const;
        }
      } else if (current.progressM+0.15<progress) return hidden();
    }
  }
  record.visualIdentity=key; record.visualPacket=packet; record.visualSampledAt=preview!.sampled_at_ms;
  record.visualStopIndex=current.stopOccurrenceIndex;
  record.authorizedPreview=next; record.progNow=sampleAuthorizedPreview(next,monotonicMs)!.progressM;
  return 'updated' as const;
}

/** Apply one backend-authoritative transit sample; never extrapolate it. */
export function applyGatewayTransitUpdate(
  record: { journeyId?: string | null; animStart: number | null; progNow?: number | null;
    marker: { setPosition: (position: { lat: number; lng: number }) => void;
      setVisible?: (visible: boolean) => void } },
  incoming: { journeyId?: string | null; publicationStatus?: string | null;
    latitude: number; longitude: number; progressM?: number | null },
) {
  record.animStart = null;
  if (incoming.publicationStatus === "PENDING" && incoming.journeyId
      && incoming.journeyId === record.journeyId) {
    return "held" as const;
  }
  if (incoming.publicationStatus === "PENDING") {
    // No ready position exists for this new journey. Do not draw the timeline
    // fallback and then visibly rewind it when detailed physics becomes ready.
    record.journeyId = incoming.journeyId ?? null;
    record.progNow = null;
    record.marker.setVisible?.(false);
    return "hidden" as const;
  }
  record.journeyId = incoming.journeyId ?? null;
  record.progNow = incoming.progressM ?? null;
  record.marker.setPosition({ lat: incoming.latitude, lng: incoming.longitude });
  record.marker.setVisible?.(true);
  return "updated" as const;
}
