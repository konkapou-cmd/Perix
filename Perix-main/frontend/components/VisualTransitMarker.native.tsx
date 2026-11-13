import React, { useEffect, useMemo, useRef, useState } from "react";
import { Marker } from "react-native-maps";
import { View } from "react-native";
import type { MotionPreview } from "../lib/api/mobility";
import { authorizePreview, sampleAuthorizedPreview } from "../lib/city/transitPublication";
import { visualPathCumulative } from "../lib/city/transitPath";
import type { QueueOffset } from "../lib/city/stationQueue";
import { vehicleKindViewAngle } from "../lib/mobilityViewSources.generated";
import { MAP_LAYERS } from '../lib/city/mapPresentation';

export type VisualMarkerInput = {
  id: string; latitude: number; longitude: number; type?: string; estimated?: boolean;
  heading?: number | null;
  journeyId?: string | null; patternId?: string | null; planRevision?: string | null;
  progressM?: number | null; nextTimelineIndex?: number | null; distanceToNextStopM?: number | null;
  nextStopEtaSeconds?: number | null; geometryFingerprint?: string | null;
  motionPreview?: MotionPreview | null; publicationStatus?: string | null;
  path?: { latitude: number; longitude: number }[];
};

function segmentBearing(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){
  const r=Math.PI/180,lat1=a.latitude*r,lat2=b.latitude*r,dl=(b.longitude-a.longitude)*r;
  const y=Math.sin(dl)*Math.cos(lat2),x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dl);
  return (Math.atan2(y,x)/r+360)%360;
}

/** Native uses the same bounded schema-2 equations as web, no extrapolation. */
export default function VisualTransitMarker({ marker, onPress, children, renderIcon, queueOffset, iconSizePx=20, cameraHeading=0 }: {
  marker: VisualMarkerInput; onPress?: () => void; children?: React.ReactNode; renderIcon?:(viewAngle:number)=>React.ReactNode;
  queueOffset?: QueueOffset; iconSizePx?: number; cameraHeading?:number;
}) {
  const [coordinate, setCoordinate] = useState({ latitude: marker.latitude, longitude: marker.longitude });
  const [travelBearing,setTravelBearing]=useState(marker.heading ?? 0);
  const headingRef=useRef(cameraHeading);headingRef.current=cameraHeading;
  const viewAngle=vehicleKindViewAngle(marker.type || "bus",travelBearing,headingRef.current);
  const [visible,setVisible] = useState(false);
  const geometry = useMemo(() => {
    const points = marker.path || [];
    const cum = visualPathCumulative(points);
    return { points, cum };
  }, [marker.path]);
  useEffect(()=>setTravelBearing(marker.heading ?? 0),[marker.heading,marker.type]);
  useEffect(() => {
    setCoordinate({ latitude: marker.latitude, longitude: marker.longitude });
    if (marker.publicationStatus !== "READY" || marker.motionPreview?.schema !== 2) {setVisible(false);return;}
    const active = authorizePreview(marker.motionPreview, {
      estimated: !!marker.estimated, mode: marker.type, journeyId: marker.journeyId,
      patternId: marker.patternId, planRevision: marker.planRevision, progressM: marker.progressM,
      pathLengthM: geometry.cum[geometry.cum.length-1], geometryFingerprint: marker.geometryFingerprint,
      nextTimelineIndex: marker.nextTimelineIndex, distanceToNextStopM: marker.distanceToNextStopM,
      nextStopEtaSeconds: marker.nextStopEtaSeconds,
    }, Date.now(), performance.now());
    if (!active) {setVisible(false);return;}
    setVisible(true);
    let frame = 0, cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const sample = sampleAuthorizedPreview(active, performance.now());
      if (!sample || sample.expired) {setVisible(false);return;}
      const { points, cum } = geometry;
      for (let i = 0; i+1 < cum.length; i++) {
        if (sample.progressM > cum[i+1]) continue;
        const ratio = Math.max(0, Math.min(1, (sample.progressM-cum[i])/Math.max(0.001, cum[i+1]-cum[i])));
        setCoordinate({ latitude: points[i].latitude+(points[i+1].latitude-points[i].latitude)*ratio,
          longitude: points[i].longitude+(points[i+1].longitude-points[i].longitude)*ratio });
        const bearing=segmentBearing(points[i],points[i+1]);
        setTravelBearing(previous=>previous===bearing?previous:bearing);
        break;
      }
      if (!sample.expired) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [marker, geometry]);
  if (marker.publicationStatus !== "READY" || !visible) return null;
  // Keep the native anchor within [0,1] on Android: the transparent layout
  // canvas contains the displaced symbol, not displaced geographic progress.
  const x=queueOffset?.x || 0,y=queueOffset?.y || 0;
  return <Marker coordinate={coordinate} anchor={{x:0.5,y:0.5}}
    onPress={event=>{event.stopPropagation();onPress?.();}} zIndex={MAP_LAYERS.vehicle}>
    <View style={{width:iconSizePx+Math.abs(x)*2,height:iconSizePx+Math.abs(y)*2,alignItems:'center',justifyContent:'center'}}>
      <View style={{transform:[{translateX:x},{translateY:y}]}}>{renderIcon ? renderIcon(viewAngle) : children}</View>
    </View>
  </Marker>;
}
