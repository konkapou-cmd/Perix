/** Decoration only: never filter physical platforms or retime transit. */
export const STOP_ARTWORK_ZOOM=15;
/** Shared ordering: artwork can never cover a stop, entity pin or vehicle. */
export const MAP_LAYERS={landmark:10,route:15000,journey:16000,stop:20000,pin:30000,vehicle:40000,selection:50000,user:60000} as const;
export function transitStopAppearance(zoom: number) {
  // Three stable tiers: dots, artwork, then readable names/platform codes.
  // All tiers
  // share one geographic anchor, so a tier crossing never moves the pin.
  const z=Number.isFinite(zoom)?zoom:14;
  if(z<STOP_ARTWORK_ZOOM)return{bucket:'pin',dot:true,size:Math.max(.5,8*2**((z-14)/3)),icon:0,platforms:false,names:false,color:'#59ABE3'};
  if(z<17){const size=10+13*(z-STOP_ARTWORK_ZOOM);return{bucket:'illustrated',dot:false,size,icon:size,platforms:false,names:false,color:'#59ABE3'};}
  return{bucket:'labelled',dot:false,size:36,icon:36,platforms:true,names:true,color:'#59ABE3'};
}

/** Single and counted directory pins use exactly the same legible size curve. */
export function mapEntityPinSize(zoom:number,labelZoom=STOP_ARTWORK_ZOOM){
  const z=Number.isFinite(zoom)?zoom:14;
  return Math.min(44,Math.round(33+Math.max(0,z-labelZoom)*2));
}

/** Subcategory-emblem pins render slightly larger than plain profile pins. */
export function mapEmblemPinSize(zoom:number,labelZoom=STOP_ARTWORK_ZOOM){
  return Math.min(52,mapEntityPinSize(zoom,labelZoom)+8);
}

/** POV perspective multiplier for tilted maps: nearer the viewer (bottom of a
 *  tilted screen) renders larger, farther renders smaller — but never vanish
 *  nor explode (clamped). Flat maps always return 1: zoom curves own the size.
 *  Pure function of camera state + anchor: same input, same output. */
export function perspectiveMultiplier(
  map: {
    getTilt?: () => number; getHeading?: () => number;
    getBounds?: () => { getSouthWest: () => { lat: () => number; lng: () => number }; getNorthEast: () => { lat: () => number; lng: () => number } } | null;
    getCenter?: () => { lat: () => number; lng: () => number } | null;
  } | null | undefined,
  lat?: number | null, lng?: number | null,
): number {
  const tilt = map?.getTilt?.() ?? 0;
  if (!(tilt >= 1) || lat == null || lng == null) return 1;
  const bounds = map?.getBounds?.();
  const center = map?.getCenter?.();
  if (!bounds || !center) return 1;
  const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
  const halfLat = Math.max(1e-9, (ne.lat() - sw.lat()) / 2);
  const halfLng = Math.max(1e-9, (ne.lng() - sw.lng()) / 2);
  const heading = ((map?.getHeading?.() ?? 0) * Math.PI) / 180;
  const dLat = lat - center.lat(), dLng = (lng - center.lng()) * Math.cos((center.lat() * Math.PI) / 180);
  // Screen-down (toward the viewer under tilt) is the negative heading axis.
  const towardViewer = -(dLat * Math.cos(heading) + dLng * Math.sin(heading));
  const span = Math.max(halfLat, halfLng * Math.cos((center.lat() * Math.PI) / 180));
  const t = Math.max(-1, Math.min(1, towardViewer / Math.max(1e-9, span)));
  return Math.max(0.65, Math.min(1.6, 1 + (tilt / 67) * t * 0.35));
}

/** Route line weight follows zoom so lines thicken as you dive toward them. */
export function routeWeightForZoom(base: number, zoom: number): number {
  const z = Number.isFinite(zoom) ? zoom : 14;
  return Math.max(1, Math.min(9, Math.round(base * Math.max(0.6, Math.min(1.8, z / 14)) * 2) / 2));
}

/** Valid Cloud console vector map ID (PERIX_3D_VECTOR). Paste the exact ID
 *  from Maps Management here; an unknown ID silently falls back to raster. */
export const PERIX_VECTOR_MAP_ID = "242086816079968f2dab4657";
/** Easing for camera flights (slow ends, fast middle). */
export function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Fly-to duration by travel distance: 1200ms floor, 1500ms ceiling. */
export function flyToDurationMs(distanceM: number): number {
  const d = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 0;
  return Math.round(1200 + Math.min(300, Math.max(0, (d - 500) / 5000) * 300));
}
/** Camera tilt is locked — never changes with zoom or gestures. Vector maps
 *  (valid Cloud mapId) hold 67°; raster fallback caps at 45°, flat where
 *  Google has no 45° coverage. An unknown map ID silently falls back. */
export const LOCKED_MAP_TILT = 67;
export const RASTER_FALLBACK_TILT = 45;
/** Pick the lock target from the live renderer (UNINITIALIZED → vector hope). */
export function lockedTiltForRendering(rendering?: string | null): number {
  if (!rendering || rendering === "UNINITIALIZED") return LOCKED_MAP_TILT;
  return rendering === "VECTOR" ? LOCKED_MAP_TILT : RASTER_FALLBACK_TILT;
}

export type EmblemReference = { kind: "business-subcategory" | "business-root" | "public-service"; key: string };

/** Subcategory emblem first, then the root category. No guessing. */
export function businessEmblemKey(business: { root_category?: string | null; subcategory?: string | null; subcategories?: string[] | null }): EmblemReference | null {
  const sub = business.subcategories?.find(slug => !!slug) || business.subcategory || undefined;
  if (sub) return { kind: "business-subcategory", key: sub };
  if (business.root_category) return { kind: "business-root", key: business.root_category };
  return null;
}

type DirectoryEmblemEntity = {
  type?: string | null;
  category_ids?: string[] | null;
  publicService?: { subcategory_ids?: string[] | null } | null;
};

/** Ordered emblem candidates for gateway directory pins. Callers resolve the first hit. */
export function directoryEmblemCandidates(entity: DirectoryEmblemEntity): EmblemReference[] {
  if (entity.type === "public_service") {
    return [{ kind: "public-service", key: entity.publicService?.subcategory_ids?.find(slug => !!slug) || "government-administration" }];
  }
  if (entity.type !== "business") return [];
  const ids = (entity.category_ids || []).filter(slug => !!slug);
  const subs = ids.slice(1).map(key => ({ kind: "business-subcategory" as const, key }));
  const root = ids.length ? [{ kind: "business-root" as const, key: ids[0] }] : [];
  return [...subs, ...root];
}

/** Exact-address grouping, not a guessed proximity/averaged location. */
export function mapMarkerGroupKey(marker:{id:string;latitude:number;longitude:number;address?:string|null;type?:string;selectionCompass?:boolean}){
  if(marker.selectionCompass || ['bus','tram','taxi'].includes(marker.type || ''))return `individual:${marker.id}`;
  const address=marker.address?.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  return address ? `address:${address}` : `point:${marker.latitude.toFixed(5)}_${marker.longitude.toFixed(5)}`;
}

export function profileInitial(name?: string | null) {
  return Array.from((name || '').trim())[0]?.toLocaleUpperCase() || '?';
}

/** Google OverlayView content. textContent prevents names becoming markup. */
export function createUserPinElement(doc:Document,imageUrl?:string | null,name?:string | null) {
  const pin=doc.createElement('div');
  pin.dataset.testid='user-location-pin';pin.dataset.userInitial=profileInitial(name);
  Object.assign(pin.style,{width:'34px',height:'34px',borderRadius:'50%',border:'3px solid #ffffff',
    boxShadow:'0 1px 6px rgba(0,0,0,0.45)',backgroundColor:'#59ABE3',overflow:'hidden',
    transform:'translate(-50%, -50%)',boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',
    color:'#fff',fontSize:'16px',fontWeight:'700'});
  pin.textContent=profileInitial(name);
  if(imageUrl){
    const img=doc.createElement('img');img.src=imageUrl;img.alt=name || '';
    Object.assign(img.style,{position:'absolute',inset:'0',width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'});
    img.onerror=()=>{img.style.display='none';};pin.appendChild(img);
  }
  return pin;
}
