export type RouteArtworkPoint={latitude:number;longitude:number};
/** Project the supplied route verbatim. Missing/invalid projection refuses the
 * entire stroke: never bridge missing points or fabricate a road segment. */
export function projectedRoutePath(points:readonly RouteArtworkPoint[],
  project:(point:RouteArtworkPoint)=>{x:number;y:number}|null|undefined):string{
  if(points.length<2)return '';
  const path:string[]=[];
  for(const [index,point] of points.entries()){
    if(!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude))return '';
    const pixel=project(point);
    if(!pixel||!Number.isFinite(pixel.x)||!Number.isFinite(pixel.y))return '';
    path.push(`${index?'L':'M'}${pixel.x.toFixed(2)},${pixel.y.toFixed(2)}`);
  }
  return path.join(' ');
}
