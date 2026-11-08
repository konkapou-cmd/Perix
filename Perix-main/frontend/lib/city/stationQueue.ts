/** Screen-space separation of estimated tram symbols at the SAME platform.
 * Geographic coordinates/progress, source clocks and preview authority are
 * untouched. This is icon layout, NOT traffic/headway or GPS simulation. */
export type StationQueueCandidate = {
  id: string; mode?: string; estimated?: boolean; state?: string; stopId?: string;
  latitude: number; longitude: number; heading?: number | null;
  departureAtMs?: number | null; arrivalAtMs?: number; sizePx: number;
};
export type QueueOffset = { x: number; y: number; rank: number };
const directionDifference = (a: number, b: number) => Math.abs(((a-b+540)%360)-180);

export function stationQueueOffsets(candidates: StationQueueCandidate[], cameraHeading = 0): Map<string, QueueOffset> {
  const groups: StationQueueCandidate[][] = [];
  for (const candidate of [...candidates].sort((a,b) => a.id.localeCompare(b.id))) {
    if (candidate.mode !== 'tram' || !candidate.estimated || candidate.state !== 'VISUAL_STOP_ESTIMATE'
      || !candidate.stopId || ![candidate.latitude,candidate.longitude,candidate.heading,candidate.sizePx].every(Number.isFinite)
      || candidate.sizePx <= 0) continue;
    const group = groups.find(([first]) => first.stopId === candidate.stopId
      && directionDifference(first.heading!,candidate.heading!) <= 30
      && Math.hypot((first.latitude-candidate.latitude)*111320,
        (first.longitude-candidate.longitude)*111320*Math.cos(first.latitude*Math.PI/180)) <= 5);
    if (group) group.push(candidate); else groups.push([candidate]);
  }
  const offsets = new Map<string, QueueOffset>();
  const time = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? value : Infinity;
  for (const group of groups) {
    if (group.length < 2) continue;
    group.sort((a,b) => (time(a.departureAtMs)-time(b.departureAtMs))
      || (time(a.arrivalAtMs)-time(b.arrivalAtMs)) || a.id.localeCompare(b.id));
    const gap = Math.max(...group.map(value => value.sizePx))+8;
    const angle = (group[0].heading!-(Number.isFinite(cameraHeading) ? cameraHeading : 0))*Math.PI/180;
    group.forEach((value,rank) => offsets.set(value.id, {
      x: -Math.sin(angle)*gap*rank, y: Math.cos(angle)*gap*rank, rank,
    }));
  }
  return offsets;
}

/** Ease only the decoration when the leader leaves; never retime its followers. */
export function smoothQueueOffset(previous: QueueOffset | undefined, target: QueueOffset, elapsedMs: number): QueueOffset {
  if (!previous) return target;
  const dx = target.x-previous.x, dy = target.y-previous.y, distance = Math.hypot(dx,dy);
  const step = Math.max(0,Math.min(160,elapsedMs))*0.18;
  const ratio = distance > 0 ? Math.min(1,step/distance) : 1;
  return { x: previous.x+dx*ratio, y: previous.y+dy*ratio, rank: target.rank };
}
