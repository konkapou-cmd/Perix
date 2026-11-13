// Existing landmark artwork, independently anchored at every zoom.
import { SUPPLEMENT_LANDMARKS, SupplementLandmark } from "./supplementLandmarks.generated";
import { ORIGINAL_LANDMARKS, OriginalLandmark } from "./originalLandmarks.generated";
import { SUPPLEMENT_LANDMARK_IMAGES } from "./supplementLandmarkImages.generated";
import { ORIGINAL_LANDMARK_IMAGES } from "./originalLandmarkImages.generated";
import { ISLAND_LANDMARKS, IslandLandmark } from "./islandLandmarks.generated";
import { ISLAND_LANDMARK_IMAGES } from "./islandLandmarkImages.generated";
import { MAP_LAYERS, STOP_ARTWORK_ZOOM, transitStopAppearance } from './mapPresentation';

export type Landmark = SupplementLandmark | OriginalLandmark | IslandLandmark;
export type { SupplementLandmark, OriginalLandmark, IslandLandmark };
export { SUPPLEMENT_LANDMARKS, ORIGINAL_LANDMARKS, ISLAND_LANDMARKS };
export const ALL_LANDMARKS: Landmark[] = [...SUPPLEMENT_LANDMARKS, ...ORIGINAL_LANDMARKS, ...ISLAND_LANDMARKS];

export function landmarkImageSource(id: string): any {
  if (id.startsWith("GR-")) return ISLAND_LANDMARK_IMAGES[id];
  return id.startsWith("MD-X") ? SUPPLEMENT_LANDMARK_IMAGES[id] : ORIGINAL_LANDMARK_IMAGES[id];
}

export type LandmarkAppearance = {
  size: number;
  bucket: string;
  detail: boolean;
  teaser: boolean;
};

// Reference close zoom for house-number detail on the base map. This does not
// detect labels from map tiles or restrict the map's own maximum zoom.
export const LANDMARK_MAX_DETAIL_ZOOM=18;
// Small-street detail reference; tile label visibility varies by base map.
export const LANDMARK_STREET_DETAIL_ZOOM=16;
/** Additional close-up steps for the tightly packed island centres. */
export const LANDMARK_MAP_MAX_ZOOM=23;
// Basemap-only checks in Mykonos/Ermoupoli, using the app's map style and
// 361x271 mobile map area: town-street names at 17, finer named lanes at 18.
// These are calibrated references, not runtime detection of Google's labels.
export const ISLAND_CITY_STREET_ZOOM=17;
export const ISLAND_ALLEY_DETAIL_ZOOM=18;
export const ISLAND_LANDMARK_LABEL_ZOOM=ISLAND_CITY_STREET_ZOOM;
export const ISLAND_STREET_ART_SIZE=42;
/** Shared size curve for web + native; no size jump at the stop-art boundary. */
export function landmarkAppearance(zoom: number, id?: string): LandmarkAppearance {
  const z = Number.isFinite(zoom) ? zoom : 14;
  if(id?.startsWith('GR-')){
    // Same enlarged distant presentation as Magdeburg, on every independent
    // source point. Shrink towards the town streets, then hold the island's
    // smaller building size all the way to maximum zoom. Never regrow it.
    const anchors=[[10,12],[12,38],[14,115],[ISLAND_CITY_STREET_ZOOM,ISLAND_STREET_ART_SIZE]];
    let size=ISLAND_STREET_ART_SIZE;
    if(z<10)size=Math.max(.5,12*2**((z-10)/2));
    else for(let i=1;z<ISLAND_CITY_STREET_ZOOM&&i<anchors.length;i++){
      if(z>anchors[i][0])continue;
      const [a,x]=anchors[i-1],[b,y]=anchors[i];size=x+(y-x)*(z-a)/(b-a);break;
    }
    return {size,bucket:z<ISLAND_LANDMARK_LABEL_ZOOM?'teaser':'full',
      detail:z>=ISLAND_LANDMARK_LABEL_ZOOM,teaser:z<ISLAND_LANDMARK_LABEL_ZOOM};
  }
  // Keep the far view; during the last dot tier shrink towards the original
  // 1x (54px), reaching it BEFORE dots become shelters. Then grow again.
  // The maximum remains the requested literal 66*12.5, without a phone cap.
  const anchors=[[10,12],[12,38],[14,115],[STOP_ARTWORK_ZOOM,54]];
  let size=54;
  if(z>=STOP_ARTWORK_ZOOM){
    const progress=Math.min(1,(z-STOP_ARTWORK_ZOOM)/(LANDMARK_MAX_DETAIL_ZOOM-STOP_ARTWORK_ZOOM));
    size=54*(825/54)**progress;
  }else if(z<10)size=Math.max(.5,12*2**((z-10)/2));
  else for(let i=1;i<anchors.length;i++){
    if(z>anchors[i][0])continue;
    const [a,x]=anchors[i-1],[b,y]=anchors[i];size=x+(y-x)*(z-a)/(b-a);break;
  }
  return {size,bucket:z<14?'teaser':z<STOP_ARTWORK_ZOOM?'near':'full',detail:z>=STOP_ARTWORK_ZOOM,teaser:z<14};
}

/** Opacity: a landmark over a business pin fades on close zoom so the pin behind is tappable. */
export function landmarkOpacity(zoom: number, hasBusinessBehind: boolean): number {
  if (!hasBusinessBehind) return 1;
  const z = Number.isFinite(zoom) ? zoom : 14;
  if (z >= 17) return 0.32;
  if (z >= 16) return 0.45;
  if (z >= 15) return 0.7;
  return 1;
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Greedy declutter: keep priority order, drop landmarks closer than the
 * on-screen footprint at this zoom. Far zoom hides more (invites zoom-in),
 * close zoom keeps almost everything realistic.
 */
export type LandmarkGroup<T> = {
  id: string;
  items: T[];
  latitude: number;
  longitude: number;
};

/** One object per source point. Kept as an adapter for existing map callers. */
export function clusterLandmarks<T extends { id: string; latitude: number; longitude: number }>(
  items: readonly T[],
  _zoom: number,
): LandmarkGroup<T>[] {
  // Preserve this shared adapter's shape for existing callers, but never
  // combine objects or average their geographic anchors.
  return items.map(item=>({id:item.id,items:[item],latitude:item.latitude,longitude:item.longitude}));
}

export type ScenePoint={latitude:number;longitude:number};
export type LandmarkDepth={opacity:number;blur:number;zIndex:number;revealsPin:boolean;showLabel:boolean;showArtwork:boolean};
/** Overscan by the actual artwork footprint; an offscreen anchor may still
 * have most of its 825px building visible inside the map. */
export function landmarkIntersectsBounds(point:ScenePoint & {id?:string},bounds:{minLat:number;maxLat:number;minLng:number;maxLng:number}|null,
  zoom:number){
  if(!bounds)return true;
  const px=(landmarkAppearance(zoom,point.id).size+24)*1.5,scale=256*2**zoom;
  const lng=px/scale*360,lat=lng*Math.cos(point.latitude*Math.PI/180);
  return point.latitude>=bounds.minLat-lat&&point.latitude<=bounds.maxLat+lat
    && point.longitude>=bounds.minLng-lng&&point.longitude<=bounds.maxLng+lng;
}
/** Camera-only footprint test. It cannot move geometry or change source clocks. */
export function landmarkDepthLayout(items:readonly (ScenePoint & {id:string})[],stops:readonly (ScenePoint & {name?:string})[],
  zoom:number,viewer:ScenePoint,heading=0,categoryActive=false):Map<string,LandmarkDepth>{
  const scale=256*2**zoom;
  const world=(p:ScenePoint)=>{const s=Math.sin(Math.max(-85,Math.min(85,p.latitude))*Math.PI/180);
    return {x:(p.longitude+180)/360*scale,y:(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*scale};};
  const origin=world(viewer),r=heading*Math.PI/180;
  const project=(p:ScenePoint)=>{const w=world(p),dx=w.x-origin.x,dy=w.y-origin.y;
    return {x:dx*Math.cos(r)+dy*Math.sin(r),y:-dx*Math.sin(r)+dy*Math.cos(r)};};
  const ordered=items.map(item=>({item,p:project(item),distance:haversineM(item.latitude,item.longitude,viewer.latitude,viewer.longitude)}))
    .sort((a,b)=>b.distance-a.distance || a.item.id.localeCompare(b.item.id));
  // The actual stop-label tier, not a separate landmark zoom threshold.
  // Names/codes start under the 36px shelter, 18px below its anchor.
  const labelRects=transitStopAppearance(zoom).names ? stops.map(stop=>{
    const q=project(stop),width=Math.max(70,(stop.name?.length ?? 12)*7);
    return {left:q.x-width/2,right:q.x+width/2,top:q.y+18,bottom:q.y+54};
  }) : [];
  const result=new Map<string,LandmarkDepth>();
  type Rect={left:number;right:number;top:number;bottom:number};
  const intersects=(a:Rect,b:Rect)=>a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
  const stableOrder=[...ordered].sort((a,b)=>a.item.id.localeCompare(b.item.id));
  const occupiedLabels:{left:number;right:number;top:number;bottom:number}[]=[];
  const labelVisibility=new Set<string>();
  // Only island labels are collision-managed here; preserve the existing
  // Magdeburg presentation. Stable order means labels do not flicker on pan.
  if(!categoryActive)for(const {item,p} of stableOrder){
    if(!item.id.startsWith('GR-') || !landmarkAppearance(zoom,item.id).detail)continue;
    const width=Math.min(220,Math.max(80,((item as {name?:string}).name?.length ?? 14)*7+12));
    const rect={left:p.x-width/2-6,right:p.x+width/2+6,top:p.y,bottom:p.y+28};
    if(occupiedLabels.some(q=>intersects(rect,q)))continue;
    occupiedLabels.push(rect);labelVisibility.add(item.id);
  }
  ordered.forEach(({item,p},index)=>{
    const size=landmarkAppearance(zoom,item.id).size;
    const left=p.x-size/2,right=p.x+size/2,top=p.y-size*.78,bottom=p.y;
    const revealsPin=labelRects.some(q=>Math.min(right,q.right)>Math.max(left,q.left)
      && Math.min(bottom,q.bottom)>Math.max(top,q.top));
    // Basemap roads are baked into Google's base layer. At street-detail zoom,
    // translucent blurred artwork lets those roads/labels show through. Real
    // route geometry is drawn separately above artwork, never reconstructed.
    const island=item.id.startsWith('GR-');
    const streetDetail=zoom>=(island?ISLAND_ALLEY_DETAIL_ZOOM:LANDMARK_STREET_DETAIL_ZOOM);
    const islandBlur=island ? Math.min(2.4,1.2+Math.max(0,zoom-ISLAND_ALLEY_DETAIL_ZOOM)*.6) : 1.2;
    result.set(item.id,{opacity:categoryActive ? .18 : revealsPin ? .2 : streetDetail ? .3 : 1,
      blur:categoryActive ? 3 : streetDetail?islandBlur:0,
      showArtwork:true,
      showLabel:!categoryActive && (item.id.startsWith('GR-') ? labelVisibility.has(item.id) : landmarkAppearance(zoom,item.id).detail),
      zIndex:Math.min(MAP_LAYERS.route-1,MAP_LAYERS.landmark+index),revealsPin});
  });
  return result;
}

/** A building tap identifies that building only, never a proximity composite. */
export function landmarkTapTargets<T extends ScenePoint & {id:string}>(selected:T,_items:readonly T[],_zoom:number):T[]{
  return [selected];
}

/** True when a business/entity pin sits under the landmark (within ~18 m). */
export function landmarkHasBusinessBehind(
  landmark: { latitude: number; longitude: number },
  pins: readonly { latitude: number; longitude: number }[],
  radiusM = 18,
): boolean {
  for (const p of pins) {
    if (haversineM(landmark.latitude, landmark.longitude, p.latitude, p.longitude) <= radiusM) return true;
  }
  return false;
}
