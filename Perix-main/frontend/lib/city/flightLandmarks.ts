/** Game-only, screen-facing artwork. No Places, app-location writes or transit. */
export type FlightBuildingPoint={id:string;name:string;latitude:number;longitude:number};
export type FlightBuildingRegion='default'|'mykonos'|'syros';
export type FlightBuildingProfile={enabled:boolean;scale:number;maxDistanceM:number;maxWidth:number;distanceFalloff?:number;zoomPoints?:readonly (readonly [number,number])[]};
export type FlightBuildingSettings=FlightBuildingProfile & {regions?:Partial<Record<Exclude<FlightBuildingRegion,'default'>,FlightBuildingProfile>>};
type FlightBuildingRecord={marker:any;root:HTMLElement;image:HTMLImageElement;source:string;status:'pending'|'loaded'|'failed'};
/** User-approved game calibrations; never read the /app size curves. */
export const DEFAULT_FLIGHT_BUILDINGS:FlightBuildingSettings={enabled:true,scale:1,maxDistanceM:11750,maxWidth:4096,distanceFalloff:0};
/** Game-owned curve; intentionally NO dependency on /app landmarkAppearance. */
export const DEFAULT_FLIGHT_BUILDING_ZOOMS=[[8,4],[12,10],[12.3,26],[16,70],[18,150],[20,450],[23,950]] as const;
/** Supplied island export explicitly approved for BOTH Mykonos and Syros. */
export const ISLAND_FLIGHT_BUILDING_ZOOMS=[[8,4],[12,64],[12.3,65],[16,70],[18,70],[20,250],[23,950]] as const;
/** Later Syros-only correction: zoom 20 -> 400px; Mykonos stays at 250px. */
export const SYROS_FLIGHT_BUILDING_ZOOMS=[[8,4],[12,64],[12.3,65],[16,70],[18,70],[20,400],[23,950]] as const;
export function flightBuildingRegion(id:string):FlightBuildingRegion{
  return id.startsWith('GR-MYKONOS-')?'mykonos':id.startsWith('GR-SYROS-')?'syros':'default';
}
export function flightBuildingRegionSettings(settings:FlightBuildingSettings,region:FlightBuildingRegion):FlightBuildingProfile{
  const {regions,...base}=settings;
  if(region==='default')return base;
  const profile=regions?.[region];
  return {...(profile??DEFAULT_FLIGHT_BUILDINGS),zoomPoints:profile?.zoomPoints?.length?profile.zoomPoints:region==='syros'?SYROS_FLIGHT_BUILDING_ZOOMS:ISLAND_FLIGHT_BUILDING_ZOOMS};
}
export function withFlightBuildingRegionSettings(settings:FlightBuildingSettings,region:FlightBuildingRegion,profile:FlightBuildingProfile):FlightBuildingSettings{
  // Strip any nested profile container from caller-provided data.
  const {regions:ignored,...clean}=profile as FlightBuildingSettings;
  return region==='default'?{...clean,regions:settings.regions}:{...settings,regions:{...settings.regions,[region]:clean}};
}
export function flightBuildingBaseWidth(zoom:number,custom?:readonly (readonly [number,number])[]){
  const points=custom?.length?custom:DEFAULT_FLIGHT_BUILDING_ZOOMS;
  const z=Number.isFinite(zoom)?zoom:18,[first,width]=points[0];
  if(z<=first)return Math.max(.5,width*2**(z-first));
  for(let i=1;i<points.length;i++){const [a,x]=points[i-1],[b,y]=points[i];if(z<=b)return x+(y-x)*(z-a)/(b-a);}
  return points[points.length-1][1];
}
export function withFlightBuildingZoomPoint(settings:FlightBuildingSettings,zoom:number,width:number):FlightBuildingSettings{
  if(!Number.isFinite(zoom)||!Number.isFinite(width))return settings;
  const z=Math.max(3,Math.min(23,Math.round(zoom*100)/100)),px=Math.max(2,Math.min(4096,width));
  const points=(settings.zoomPoints||[]).filter(point=>point[0]!==z).map(point=>[point[0],point[1]] as [number,number]);
  points.push([z,px]);points.sort((a,b)=>a[0]-b[0]);
  return {...settings,zoomPoints:points};
}
export function flightBuildingStyle(point:FlightBuildingPoint,aircraft:{latitude:number;longitude:number;altitude:number},baseWidth:number,settings:FlightBuildingSettings){
  if(!settings.enabled||![point.latitude,point.longitude,aircraft.latitude,aircraft.longitude,aircraft.altitude,baseWidth].every(Number.isFinite))return null;
  const rad=Math.PI/180,dLat=(point.latitude-aircraft.latitude)*rad,dLng=(point.longitude-aircraft.longitude)*rad;
  const a=Math.sin(dLat/2)**2+Math.cos(point.latitude*rad)*Math.cos(aircraft.latitude*rad)*Math.sin(dLng/2)**2;
  const ground=6371000*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,a))));
  const distance=Math.hypot(ground,Math.max(0,aircraft.altitude));
  const range=Math.max(250,Math.min(200000,Number.isFinite(settings.maxDistanceM)?settings.maxDistanceM:DEFAULT_FLIGHT_BUILDINGS.maxDistanceM));
  const scale=Math.max(.1,Math.min(20,Number.isFinite(settings.scale)?settings.scale:1));
  const cap=Math.max(20,Math.min(4096,Number.isFinite(settings.maxWidth)?settings.maxWidth:DEFAULT_FLIGHT_BUILDINGS.maxWidth));
  const falloff=Math.max(0,Math.min(4,Number.isFinite(settings.distanceFalloff)?settings.distanceFalloff!:1));
  if(distance>range)return null;
  const width=Math.min(cap,Math.max(0,baseWidth)*scale/Math.sqrt(1+falloff*(distance/(range*.25))**2));
  if(width<2)return null;
  return {width,height:width*.78,opacity:.35+.65*(1-distance/range),distance};
}

/** Native Maps markers billboard their DOM content toward the screen through
 * heading/tilt changes. We never apply a world rotation to these flat images. */
export async function createFlightBuildings(google:any,map:any,options:{points:readonly FlightBuildingPoint[];image:(id:string)=>string;baseWidth?:(zoom:number,id:string)=>number;doc?:Document;onChange?:()=>void}){
  const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');
  if(typeof AdvancedMarkerElement!=='function')throw Error('Screen-facing marker renderer unavailable');
  const doc=options.doc||document,records=new Map<string,FlightBuildingRecord>();
  let closed=false,retry=0;
  const remove=(rec:FlightBuildingRecord)=>{
    rec.image.onload=null;rec.image.onerror=null;rec.image.removeAttribute?.('src');rec.marker.map=null;rec.root.remove();
  };
  return {
    update(aircraft:{latitude:number;longitude:number;altitude:number},zoom:number,settings:FlightBuildingSettings){
      if(closed)return;
      const active=new Set<string>(),bounds=map.getBounds?.();
      const candidates=options.points.flatMap(point=>{
        if(bounds&&!bounds.contains({lat:point.latitude,lng:point.longitude}))return [];
        const profile=flightBuildingRegionSettings(settings,flightBuildingRegion(point.id));
        const base=options.baseWidth?.(zoom,point.id)??flightBuildingBaseWidth(zoom,profile.zoomPoints);
        const style=flightBuildingStyle(point,aircraft,base,profile);return style?[{point,style}]:[];
      }).sort((a,b)=>a.style.distance-b.style.distance||a.point.id.localeCompare(b.point.id));
      for(const [rank,{point,style}] of candidates.entries()){
        active.add(point.id);let rec=records.get(point.id);
        if(!rec){
          const root=doc.createElement('div'),image=doc.createElement('img');
          root.dataset.flightBuildingId=point.id;root.title=point.name;root.setAttribute('aria-hidden','true');
          Object.assign(root.style,{pointerEvents:'none',userSelect:'none'});
          image.alt=point.name;image.draggable=false;image.decoding='async';image.loading='eager';
          if('fetchPriority' in image)image.fetchPriority=rank<3?'high':'auto';
          Object.assign(image.style,{display:'block',width:'100%',height:'100%',objectFit:'contain',pointerEvents:'none',filter:'drop-shadow(0 2px 2px #102b4444)',transition:'opacity 160ms linear'});
          root.appendChild(image);
          const label=doc.createElement('span');label.textContent=point.name;label.dataset.flightBuildingLabel='true';
          Object.assign(label.style,{position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)',marginTop:'2px',maxWidth:'160px',width:'max-content',padding:'1px 4px',borderRadius:'4px',background:'#ffffffd9',color:'#17364e',font:'10px/1.2 system-ui',textAlign:'center',whiteSpace:'normal',overflowWrap:'anywhere',pointerEvents:'none'});
          root.appendChild(label);
          root.style.position='relative';
          const marker=new AdvancedMarkerElement({map,position:{lat:point.latitude,lng:point.longitude},content:root,
            anchorLeft:'-50%',anchorTop:'-50%',collisionBehavior:'REQUIRED',zIndex:10+candidates.length-rank});
          rec={marker,root,image,source:options.image(point.id),status:'pending'};records.set(point.id,rec);
          root.dataset.flightBuildingLoad='pending';
          const record=rec;
          image.onload=()=>{
            if(closed||records.get(point.id)!==record)return;
            record.status=image.naturalWidth>0?'loaded':'failed';root.dataset.flightBuildingLoad=record.status;options.onChange?.();
          };
          image.onerror=()=>{
            if(closed||records.get(point.id)!==record)return;
            record.status='failed';root.dataset.flightBuildingLoad='failed';options.onChange?.();
          };
          image.src=record.source;
        }
        const width=style.width.toFixed(2)+'px',height=style.height.toFixed(2)+'px',opacity=style.opacity.toFixed(3);
        if(rec.root.style.width!==width)rec.root.style.width=width;
        if(rec.root.style.height!==height)rec.root.style.height=height;
        if(rec.root.style.opacity!==opacity)rec.root.style.opacity=opacity;
        rec.marker.zIndex=10+candidates.length-rank;
        rec.root.dataset.flightBuildingRank=String(rank);rec.root.dataset.flightBuildingDistance=style.distance.toFixed(1);
      }
      for(const [id,rec] of records)if(!active.has(id)){remove(rec);records.delete(id);}
      let loaded=0,failed=0;for(const rec of records.values()){if(rec.status==='loaded')loaded++;else if(rec.status==='failed')failed++;}
      map.getDiv?.()?.setAttribute('data-flight-building-count',String(records.size));
      map.getDiv?.()?.setAttribute('data-flight-building-loaded',String(loaded));
      map.getDiv?.()?.setAttribute('data-flight-building-failed',String(failed));
      const nearest=candidates[0];
      return {count:records.size,loaded,failed,pending:records.size-loaded-failed,nearest:nearest?{id:nearest.point.id,name:nearest.point.name,width:nearest.style.width,distance:nearest.style.distance}:null};
    },
    retryFailed(){
      if(closed)return;
      for(const rec of records.values())if(rec.status==='failed'){
        rec.status='pending';rec.root.dataset.flightBuildingLoad='pending';
        rec.image.src=rec.source+(rec.source.includes('?')?'&':'?')+'flight-retry='+String(++retry);
      }
      options.onChange?.();
    },
    dispose(){closed=true;for(const rec of records.values())remove(rec);records.clear();
      for(const name of ['count','loaded','failed'])map.getDiv?.()?.removeAttribute('data-flight-building-'+name);
    },
  };
}
