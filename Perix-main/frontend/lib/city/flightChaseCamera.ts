import { FLIGHT_TILT, FLIGHT_RULES, flightCameraTilt } from './flightSimulation';

/** Oblique overhead aircraft view. Match Maps' tilt convention: 0° looks
 * straight down, neutral 67° is inclined from vertical. Pitch changes the
 * viewing inclination along with altitude; use Maps' actual tilt when available. Stay
 * above the airplane; lowering its on-screen dock must not aim it from below.
 */
export const FLIGHT_VIEW = {
  fov: 40, wingFraction: 0.62, tilt: FLIGHT_TILT, basePitch: 0, maxPitch: FLIGHT_RULES.maxPitch,
  baseAircraftScale: 0.8, highAltitudeMinScale: 0.75,
} as const;
/** Slightly smaller aircraft at country-scale height, not a disappearing pin.
 * Pull the foreground camera back, preserving the original model and dock. */
export function flightAircraftViewScale(altitude: number) {
  const height = Number.isFinite(altitude) ? altitude : FLIGHT_RULES.startAltitude;
  const t = Math.max(0, Math.min(1, Math.log(Math.max(1, height / FLIGHT_RULES.overheadAltitude))
    / Math.log(FLIGHT_RULES.maxAltitude / FLIGHT_RULES.overheadAltitude)));
  return FLIGHT_VIEW.baseAircraftScale * (1 - (1 - FLIGHT_VIEW.highAltitudeMinScale) * t * t * (3 - 2 * t));
}
/** Fallback tailplane midpoint in the supplied model's local coordinates.
 * Loaded GLBs provide their actual horizontal-tail bounds instead.
 */
export const FLIGHT_TAIL_ANCHOR = { x: 0, y: 0.44, z: 2.7 } as const;
export function flightChaseView(width: number, height: number, wingspan = 8.9632, tilt: number = FLIGHT_VIEW.tilt) {
  const angle = Math.max(0, Math.min(85, Number.isFinite(tilt) ? tilt : FLIGHT_VIEW.tilt)) * Math.PI / 180;
  const aspect = Math.max(0.25, width / Math.max(1, height));
  const halfFov = Math.tan(FLIGHT_VIEW.fov * Math.PI / 360);
  const distance = Math.max(wingspan * 1.3, wingspan / (2 * halfFov * aspect * FLIGHT_VIEW.wingFraction));
  return { fov: FLIGHT_VIEW.fov, aspect, near: 0.1, far: 300,
    distance,
    position: { x: 0, y: distance*Math.cos(angle), z: distance*Math.sin(angle) },
    // Explicit perpendicular up vector avoids lookAt's vertical-axis
    // singularity when altitude flattens the view all the way to 0° tilt.
    up: { x: 0, y: Math.sin(angle), z: -Math.cos(angle) },
    target: { x: 0, y: 0, z: 0 }, verticalOffsetY: 0 };
}
export function flightChasePose(pitch: number, bank: number) {
  // Neutral flight is parallel to the map/ground: no artificial nose trim.
  // The actual pitch command raises/lowers the nose; camera follows separately.
  return { pitch: FLIGHT_VIEW.basePitch + Math.max(-FLIGHT_VIEW.maxPitch, Math.min(FLIGHT_VIEW.maxPitch, pitch)),
    yaw: bank * 0.12, bank };
}

/** Projected midpoint of the horizontal tailplane, in CSS canvas pixels.
 * No screen-percentage guess or arbitrary mobile offset. The lever's neutral
 * track center is placed here. Align to the NEUTRAL pose, not each bank/pitch
 * frame: otherwise changing altitude would move the control under the finger.
 */
export function flightTailLeverPosition(ndc: { x: number; y: number }, width: number, height: number) {
  if (![ndc.x, ndc.y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { left: (ndc.x + 1) * width / 2, top: (1 - ndc.y) * height / 2 };
}

/** Old bottom-center lever position: move the aircraft AND tail reference
 * down to this dock. The input height uses the same CSS-pixel value as the UI.
 */
export function flightLowerDock(width: number, height: number) {
  const leverHeight = Math.max(64, Math.min(110, height * 0.18));
  return { left: width / 2, top: height - 36 - (leverHeight + 58) / 2, leverHeight };
}
type Pose = { pitch: number; yaw: number; bank: number };
function rotation(pose: Pose) {
  const a=Math.cos(pose.pitch), b=Math.sin(pose.pitch), c=Math.cos(pose.yaw), d=Math.sin(pose.yaw), e=Math.cos(pose.bank), f=Math.sin(pose.bank);
  // YXZ rotation, same order as the Three.js aircraft group.
  return [c*e+d*b*f,d*b*e-c*f,a*d, a*f,a*e,-b, c*b*f-d*e,d*f+c*b*e,a*c];
}

/** Keep the requested flight viewing angle while docking the tail lower using
 * an off-axis projection. The old lookAt target changed the viewing angle and
 * exposed the underside. Fit real bounds without per-vertex allocation.
 */
export function flightDockedView(width: number, height: number, wingspan: number, pose: Pose,
  points: ArrayLike<number>, tail = FLIGHT_TAIL_ANCHOR as { x:number; y:number; z:number },
  tilt = flightCameraTilt(pose.pitch), altitude: number = FLIGHT_RULES.startAltitude) {
  const base = flightChaseView(width, height, wingspan, tilt), dock = flightLowerDock(width, height);
  const neutral = rotation(flightChasePose(0,0));
  const tailY = neutral[3]*tail.x + neutral[4]*tail.y + neutral[5]*tail.z;
  const tailZ = neutral[6]*tail.x + neutral[7]*tail.y + neutral[8]*tail.z;
  const r = rotation(pose), tan = Math.tan(base.fov * Math.PI / 360);
  const sin = base.position.y / base.distance, cos = base.position.z / base.distance;
  const desiredY = 1 - 2 * dock.top / height;
  const shiftFor = (distance: number) => {
    const dy = tailY - distance*sin, dz = tailZ - distance*cos;
    const neutralY = (dy*cos-dz*sin)/((-dy*sin-dz*cos)*tan);
    return desiredY - neutralY;
  };
  const fits = (distance: number) => {
    const shift = shiftFor(distance);
    for (let i=0;i<points.length;i+=3) {
      const x=points[i],y=points[i+1],z=points[i+2];
      const px=r[0]*x+r[1]*y+r[2]*z;
      const dy=r[3]*x+r[4]*y+r[5]*z-distance*sin;
      const dz=r[6]*x+r[7]*y+r[8]*z-distance*cos;
      const depth=-dy*sin-dz*cos;
      if (depth<=base.near || Math.abs(px/(depth*tan*base.aspect))>0.95
        || Math.abs((dy*cos-dz*sin)/(depth*tan)+shift)>0.95) return false;
    }
    return true;
  };
  let low=base.distance, high=low;
  if (!fits(high)) {
    for(let i=0;i<16&&!fits(high);i++){low=high;high*=1.35;}
    for(let i=0;i<9;i++){const mid=(low+high)/2;if(fits(mid))high=mid;else low=mid;}
  }
  high /= flightAircraftViewScale(altitude);
  return {...base, distance:high, far:Math.max(base.far,high*4),
    position:{x:0,y:high*sin,z:high*cos}, verticalOffsetY:shiftFor(high)*height/2, dock};
}
