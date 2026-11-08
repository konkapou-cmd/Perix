/** Camera-independent position and forward tangent on validated directed geometry. */
type Point = { latitude: number; longitude: number };

export function visualPathCumulative(points: Point[]) {
  const cumulative = [0];
  for (let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],r=Math.PI/180;
    const h=Math.sin((b.latitude-a.latitude)*r/2)**2
      +Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin((b.longitude-a.longitude)*r/2)**2;
    cumulative.push(cumulative[i-1]+6371000*2*Math.asin(Math.min(1,Math.sqrt(h))));
  }
  return cumulative;
}

export function sampleVisualPath(points: Point[], cumulative: number[], progress: number) {
  if (points.length<2 || cumulative.length!==points.length || !Number.isFinite(progress)) return null;
  const total=cumulative[cumulative.length-1];
  if (!Number.isFinite(total) || total<=0) return null;
  const at=(distance:number)=>{
    distance=Math.max(0,Math.min(total,distance));
    let lo=0,hi=cumulative.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<=distance)lo=mid;else hi=mid;}
    const span=cumulative[hi]-cumulative[lo];
    const fraction=span>0?(distance-cumulative[lo])/span:0;
    return {lat:points[lo].latitude+(points[hi].latitude-points[lo].latitude)*fraction,
      lng:points[lo].longitude+(points[hi].longitude-points[lo].longitude)*fraction};
  };
  const point=at(progress),a=at(progress-2),b=at(progress+2);
  if (![point.lat,point.lng,a.lat,a.lng,b.lat,b.lng].every(Number.isFinite)) return null;
  const r=Math.PI/180,dLon=(b.lng-a.lng)*r;
  const y=Math.sin(dLon)*Math.cos(b.lat*r);
  const x=Math.cos(a.lat*r)*Math.sin(b.lat*r)-Math.sin(a.lat*r)*Math.cos(b.lat*r)*Math.cos(dLon);
  const heading=Math.abs(x)+Math.abs(y)>1e-14?(Math.atan2(y,x)/r+360)%360:null;
  return {...point,heading};
}

/** Slice only a validated, directed route segment between two metre offsets. */
export function sliceVisualPath(points: Point[], fromM: number, toM: number): Point[] {
  if (points.length<2 || !Number.isFinite(fromM) || !Number.isFinite(toM) || fromM<0 || toM<=fromM) return [];
  const cumulative=visualPathCumulative(points),total=cumulative[cumulative.length-1];
  if (!Number.isFinite(total) || toM>total+0.5) return [];
  const start=sampleVisualPath(points,cumulative,fromM),end=sampleVisualPath(points,cumulative,toM);
  if (!start || !end) return [];
  const middle=points.filter((_,index)=>cumulative[index]>fromM && cumulative[index]<toM);
  return [{latitude:start.lat,longitude:start.lng},...middle,{latitude:end.lat,longitude:end.lng}];
}
