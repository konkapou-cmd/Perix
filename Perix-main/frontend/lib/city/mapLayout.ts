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
