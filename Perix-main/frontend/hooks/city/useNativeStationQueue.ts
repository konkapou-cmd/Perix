import { useEffect, useState } from "react";
import type { VisualMarkerInput } from "../../components/VisualTransitMarker.native";
import { authorizePreview, sampleAuthorizedPreview } from "../../lib/city/transitPublication";
import { sampleVisualPath, visualPathCumulative } from "../../lib/city/transitPath";
import { stationQueueOffsets, smoothQueueOffset, QueueOffset, StationQueueCandidate } from "../../lib/city/stationQueue";

/** One native decoration clock for the fleet; never another position engine. */
export function useNativeStationQueue(markers: VisualMarkerInput[], sizePx: number, cameraHeading: number) {
  const [offsets,setOffsets] = useState(new Map<string,QueueOffset>());
  useEffect(() => {
    let cancelled=false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const records=markers.filter(m => m.type==='tram' && m.estimated && m.publicationStatus==='READY').flatMap(marker => {
      const points=marker.path || [],cum=visualPathCumulative(points);
      const active=authorizePreview(marker.motionPreview,{estimated:true,mode:marker.type,journeyId:marker.journeyId,
        patternId:marker.patternId,planRevision:marker.planRevision,progressM:marker.progressM,
        pathLengthM:cum[cum.length-1],geometryFingerprint:marker.geometryFingerprint,nextTimelineIndex:marker.nextTimelineIndex,
        distanceToNextStopM:marker.distanceToNextStopM,nextStopEtaSeconds:marker.nextStopEtaSeconds},Date.now(),performance.now());
      return active ? [{marker,points,cum,active}] : [];
    });
    let previousAt=performance.now();
    const tick=() => {
      if (cancelled) return;
      const now=performance.now(),candidates: StationQueueCandidate[]=[];
      let active=false;
      for (const record of records) {
        const sample=sampleAuthorizedPreview(record.active,now);
        if (!sample || sample.expired) continue;
        active=true;
        const point=sampleVisualPath(record.points,record.cum,sample.progressM);
        if (point) candidates.push({id:record.marker.id,mode:'tram',estimated:true,state:sample.state,
          stopId:sample.stationStopId,latitude:point.lat,longitude:point.lng,heading:point.heading,
          departureAtMs:sample.stationDepartureAtMs,arrivalAtMs:sample.stationArrivalAtMs,sizePx});
      }
      const target=stationQueueOffsets(candidates,cameraHeading),elapsed=now-previousAt;
      setOffsets(previous => {
        const next=new Map<string,QueueOffset>();
        for (const id of new Set([...target.keys(),...previous.keys()])) {
          const value=smoothQueueOffset(previous.get(id),target.get(id) || {x:0,y:0,rank:0},elapsed);
          if (target.has(id) || Math.hypot(value.x,value.y)>0.05) next.set(id,value);
        }
        const same=next.size===previous.size && [...next].every(([id,value]) => {
          const old=previous.get(id);
          return old && old.rank===value.rank && Math.hypot(old.x-value.x,old.y-value.y)<0.05;
        });
        return same ? previous : next;
      });
      previousAt=now;
      if (active) timer=setTimeout(tick,100);
    };
    tick();
    return () => {cancelled=true;if(timer!==undefined)clearTimeout(timer);};
  },[markers,sizePx,cameraHeading]);
  return offsets;
}
