/** One page frame/gutter and two fixed primary navigation slots on every map screen. */
export const MAP_PAGE_MAX_WIDTH = 1280;
export const MAP_PAGE_GUTTER = 16;
export const MAP_PAGE_BACKGROUND = "#fff";
export const MAP_HEADER_BRAND_HEIGHT = 56;
export const MAP_NAV_APP_WIDTH = 64;
export const MAP_NAV_MEMBERS_WIDTH = 104;
/** Shared APP/Members pill palette for map actions. */
export const MAP_ACTION_COLORS = {
  background: "#eaf5fc", activeBackground: "#59ABE3", text: "#216BA2", activeText: "#fff",
} as const;

/** Image-led category buttons, shared by every /app taxonomy depth. */
export function categoryButtonMetrics(width:number){
  const safeWidth=Number.isFinite(width)?Math.max(240,width):375;
  const contentWidth=Math.min(safeWidth,MAP_PAGE_MAX_WIDTH)-MAP_PAGE_GUTTER*2;
  const columns=Math.max(2,Math.min(8,Math.floor(contentWidth/128)));
  const faceSize=Math.max(64,Math.min(120,Math.floor(contentWidth/columns)-16));
  return {columns,faceSize,iconSize:faceSize-8};
}

/**
 * Prefer 6.5km in the short ground dimension, while keeping ultrawide
 * viewports inside the nearby endpoint's 14km span limit.
 */
export function initialNearbyMapZoom(width:number,height:number,latitude:number,targetSpanM=6500,maxSpanM=13500,maxZoom=14){
  if(![width,height,latitude,targetSpanM,maxSpanM,maxZoom].every(Number.isFinite)
    ||width<=0||height<=0||targetSpanM<=0||maxSpanM<=0)return 13;
  const metersPerPixel=40075016.686/(256*2**14)*Math.max(0,Math.cos(latitude*Math.PI/180));
  const minSpanAtZoom14=Math.min(width,height)*metersPerPixel;
  const maxSpanAtZoom14=Math.max(width,height)*metersPerPixel;
  if(minSpanAtZoom14<=0||maxSpanAtZoom14<=0)return 13;
  const targetZoom=14-Math.log2(targetSpanM/minSpanAtZoom14);
  const compactZoom=14-Math.log2(maxSpanM/maxSpanAtZoom14);
  return Math.max(10,Math.min(maxZoom,Math.max(targetZoom,compactZoom)));
}

export function mapHeaderMetrics(width:number){
  const compact=width<600;
  const appWidth=compact?44:MAP_NAV_APP_WIDTH,membersWidth=compact?76:MAP_NAV_MEMBERS_WIDTH,gap=compact?4:6;
  return{compact,appWidth,membersWidth,gap,primaryWidth:appWidth+membersWidth+gap,logoWidth:compact?80:132};
}

export type AutoCameraPoint = { latitude:number; longitude:number };
export type AutoCameraState = { token:number; cancelled:boolean; zoom:number|null; signature:string };
export type AutoCameraTarget = { latitude:number; longitude:number; zoom:number };

/** Camera-only projection; never changes a stop, route, position or source clock. */
export function autoCameraTarget(points:readonly AutoCameraPoint[],width:number,height:number,padding=48,maxZoom=18):AutoCameraTarget|null {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=padding*2||height<=padding*2||points.length<2)return null;
  if(!points.every(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=85&&Math.abs(p.longitude)<=180))return null;
  const xs=points.map(p=>(p.longitude+180)/360);
  const ys=points.map(p=>{const s=Math.sin(p.latitude*Math.PI/180);return .5-Math.log((1+s)/(1-s))/(4*Math.PI);});
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  // These three regions never cross the dateline. Refuse an unrelated/global fit.
  if(maxX-minX>.5)return null;
  const zoomX=Math.log2((width-padding*2)/(256*Math.max(1e-12,maxX-minX)));
  const zoomY=Math.log2((height-padding*2)/(256*Math.max(1e-12,maxY-minY)));
  const y=(minY+maxY)/2;
  return {longitude:(minX+maxX)/2*360-180,latitude:Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI,
    zoom:Math.max(3,Math.min(maxZoom,zoomX,zoomY))};
}

/** First fit may zoom out; subsequent fits only zoom in. A gesture wins until a new explicit token. */
export function advanceAutoCamera(previous:AutoCameraState|null,token:number,target:AutoCameraTarget|null) {
  const state:AutoCameraState=previous?.token===token ? {...previous} : {token,cancelled:false,zoom:null,signature:''};
  if(state.cancelled||!target)return {state,target:null};
  const zoom=state.zoom===null?target.zoom:Math.max(state.zoom,target.zoom);
  // Do not zoom out or pan after the fitted group starts diverging again.
  if(state.zoom!==null&&target.zoom<state.zoom-.05)return {state,target:null};
  const next={...target,zoom};
  const signature=`${next.latitude.toFixed(4)}|${next.longitude.toFixed(4)}|${next.zoom.toFixed(1)}`;
  if(signature===state.signature)return {state,target:null};
  state.zoom=zoom;state.signature=signature;
  return {state,target:next};
}
