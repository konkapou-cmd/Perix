const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../lib/city/flightLandmarks.ts'),'utf8'),api={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api,console});
const point={id:'legacy-001',name:'Original artwork',latitude:52.1372132,longitude:11.6384846},plane={...point,altitude:25},settings={...api.DEFAULT_FLIGHT_BUILDINGS};
test('flight buildings become smaller with actual distance/altitude and respect independent game scale/cap',()=>{
  const distanceSettings={...settings,distanceFalloff:1};
  const near=api.flightBuildingStyle(point,plane,120,distanceSettings);
  const far=api.flightBuildingStyle({...point,latitude:point.latitude+.015},plane,120,distanceSettings);
  const high=api.flightBuildingStyle(point,{...plane,altitude:2000},120,distanceSettings);
  assert.ok(near.width>far.width&&near.width>high.width);assert.ok(near.opacity>far.opacity);
  assert.equal(near.height,near.width*.78);
  const capped=api.flightBuildingStyle(point,plane,900,{...settings,scale:2,maxWidth:80});assert.equal(capped.width,80);
  assert.equal(api.flightBuildingStyle(point,{...plane,altitude:12000},300,settings),null);
  assert.equal(api.flightBuildingStyle(point,plane,300,{...settings,enabled:false}),null);
  assert.equal(api.flightBuildingStyle({...point,latitude:NaN},plane,300,settings),null);
  assert.equal(api.flightBuildingStyle(point,plane,1,settings),null);
});
test('marker billboards preserve geographic anchors, reuse artwork and never apply world rotation',async()=>{
  const created=[],requests=[];
  class Element{constructor(tag){this.tagName=tag;this.style={};this.dataset={};this.children=[];this.attrs={};}appendChild(e){this.children.push(e);}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}remove(){this.removed=true;}}
  class Marker{constructor(options){Object.assign(this,options);created.push(this);}}
  const host=new Element('div'),map={getBounds:()=>({contains:p=>p.lat===point.latitude}),getDiv:()=>host};
  const google={maps:{importLibrary:async name=>{assert.equal(name,'marker');return {AdvancedMarkerElement:Marker};}}};
  const other={...point,id:'outside',latitude:point.latitude+1},before=JSON.stringify([point,other,plane]);
  const layer=await api.createFlightBuildings(google,map,{points:[point,other],doc:{createElement:tag=>new Element(tag)},baseWidth:()=>300,image:id=>{requests.push(id);return '/own/'+id+'.webp';}});
  layer.update(plane,18,settings);assert.equal(created.length,1);assert.deepEqual(requests,[point.id]);
  const marker=created[0];assert.equal(marker.position.lat,point.latitude);assert.equal(marker.position.lng,point.longitude);
  assert.equal(marker.anchorLeft,'-50%');assert.equal(marker.anchorTop,'-50%');assert.equal(marker.collisionBehavior,'REQUIRED');
  assert.equal(marker.content.style.transform,undefined,'native marker faces the screen; no heading/tilt CSS rotation');
  const label=marker.content.children.find(n=>n.dataset.flightBuildingLabel);
  assert.equal(label.textContent,point.name);assert.equal(label.style.top,'100%');assert.equal(label.style.position,'absolute','label must not shift the image-centred geographic anchor');
  layer.update({...plane,heading:175},19,settings);assert.equal(created.length,1);assert.equal(requests.length,1);
  assert.equal(marker.content.style.transform,undefined);assert.equal(marker.content.style.pointerEvents,'none');
  assert.equal(JSON.stringify([point,other,plane]),before);assert.equal(host.attrs['data-flight-building-count'],'1');
  layer.update(plane,18,{...settings,enabled:false});assert.equal(marker.map,null);assert.ok(marker.content.removed);
  layer.dispose();layer.update(plane,18,settings);assert.equal(created.length,1,'no late billboard creation after leaving flight');
});
test('only the Maps marker library is used; no Places requests or application location/state writes',()=>{
  assert.match(source,/importLibrary\('marker'\)/);
  assert.doesNotMatch(source,/importLibrary\(['"]places|searchByText|gmp-place|LocationContext|MapBoundsContext|setItem\(/);
  assert.doesNotMatch(source,/import .*landmarks|landmarkAppearance\(/,'game owns its size curve independently of /app');
});
test('game zoom calibration interpolates, replaces matching zooms and never mutates defaults or prior settings',()=>{
  const before=JSON.stringify(api.DEFAULT_FLIGHT_BUILDING_ZOOMS);
  assert.equal(api.flightBuildingBaseWidth(18),150);
  assert.equal(api.flightBuildingBaseWidth(17),110);
  assert.equal(api.flightBuildingBaseWidth(7),2);
  assert.equal(api.flightBuildingBaseWidth(24),950);
  assert.equal(api.flightBuildingBaseWidth(NaN),150);
  const first=api.withFlightBuildingZoomPoint(settings,18,90);
  const saved=JSON.stringify(first);
  const second=api.withFlightBuildingZoomPoint(first,16,30);
  assert.equal(api.flightBuildingBaseWidth(17,second.zoomPoints),60);
  const replaced=api.withFlightBuildingZoomPoint(second,18,150);
  assert.equal(replaced.zoomPoints.length,2);
  assert.equal(api.flightBuildingBaseWidth(18,replaced.zoomPoints),150);
  assert.equal(api.flightBuildingBaseWidth(17,replaced.zoomPoints),90);
  assert.equal(JSON.stringify(first),saved);
  assert.equal(settings.zoomPoints,undefined);
  assert.equal(JSON.stringify(api.DEFAULT_FLIGHT_BUILDING_ZOOMS),before);
  assert.equal(api.withFlightBuildingZoomPoint(settings,NaN,40),settings);
  assert.equal(api.withFlightBuildingZoomPoint(settings,18,Infinity),settings);
  const clamped=api.withFlightBuildingZoomPoint(settings,24,9000);
  assert.equal(clamped.zoomPoints[0][0],23);assert.equal(clamped.zoomPoints[0][1],4096);
});
test('closest artwork is requested first and stays in front as aircraft position changes',async()=>{
  const created=[],requests=[];
  class Element{constructor(){this.style={};this.dataset={};}appendChild(){}setAttribute(){}removeAttribute(){}remove(){}}
  class Marker{constructor(options){Object.assign(this,options);created.push(this);}}
  const google={maps:{importLibrary:async()=>({AdvancedMarkerElement:Marker})}};
  const far={...point,id:'far',latitude:point.latitude+.01};
  const layer=await api.createFlightBuildings(google,{}, {points:[far,point],doc:{createElement:()=>new Element()},image:id=>{requests.push(id);return '/own/'+id;}});
  const first=layer.update(plane,18,settings);
  assert.deepEqual(requests,[point.id,far.id],'request nearer artwork before distant artwork');
  assert.equal(first.nearest.id,point.id);assert.equal(first.count,2);
  const nearMarker=created.find(m=>m.content.dataset.flightBuildingId===point.id),farMarker=created.find(m=>m.content.dataset.flightBuildingId===far.id);
  assert.ok(nearMarker.zIndex>farMarker.zIndex);
  assert.equal(nearMarker.content.dataset.flightBuildingRank,'0');
  const next=layer.update({...plane,latitude:far.latitude},18,settings);
  assert.equal(next.nearest.id,far.id);assert.ok(farMarker.zIndex>nearMarker.zIndex);
  assert.equal(farMarker.content.dataset.flightBuildingRank,'0');assert.equal(requests.length,2,'reorder without reloading images');
  const custom=api.withFlightBuildingZoomPoint(settings,18,60);
  layer.update({...plane,latitude:far.latitude},18,custom);
  assert.ok(parseFloat(farMarker.content.style.width)<61);
  layer.dispose();
});
test('submitted game calibration is preserved exactly and island edits cannot overwrite it or each other',()=>{
  assert.equal(settings.scale,1);assert.equal(settings.maxDistanceM,11750);assert.equal(settings.maxWidth,4096);assert.equal(settings.distanceFalloff,0);
  assert.equal(JSON.stringify(api.DEFAULT_FLIGHT_BUILDING_ZOOMS),JSON.stringify([[8,4],[12,10],[12.3,26],[16,70],[18,150],[20,450],[23,950]]));
  assert.equal(JSON.stringify(api.ISLAND_FLIGHT_BUILDING_ZOOMS),JSON.stringify([[8,4],[12,64],[12.3,65],[16,70],[18,70],[20,250],[23,950]]));
  assert.equal(JSON.stringify(api.SYROS_FLIGHT_BUILDING_ZOOMS),JSON.stringify([[8,4],[12,64],[12.3,65],[16,70],[18,70],[20,400],[23,950]]));
  for(const region of ['mykonos','syros']){
    const profile=api.flightBuildingRegionSettings(settings,region);
    assert.equal(api.flightBuildingBaseWidth(12,profile.zoomPoints),64);
    assert.equal(api.flightBuildingBaseWidth(18,profile.zoomPoints),70);
    assert.equal(api.flightBuildingBaseWidth(20,profile.zoomPoints),region==='syros'?400:250);
    assert.equal(profile.maxDistanceM,11750);assert.equal(profile.maxWidth,4096);assert.equal(profile.distanceFalloff,0);
  }
  const before=JSON.stringify(settings);
  const mykonos=api.withFlightBuildingZoomPoint(api.flightBuildingRegionSettings(settings,'mykonos'),18,320);
  const one=api.withFlightBuildingRegionSettings(settings,'mykonos',mykonos);
  const syros=api.withFlightBuildingZoomPoint(api.flightBuildingRegionSettings(one,'syros'),18,85);
  const two=api.withFlightBuildingRegionSettings(one,'syros',syros);
  assert.equal(api.flightBuildingBaseWidth(18,api.flightBuildingRegionSettings(two,'mykonos').zoomPoints),320);
  assert.equal(api.flightBuildingBaseWidth(18,api.flightBuildingRegionSettings(two,'syros').zoomPoints),85);
  assert.equal(api.flightBuildingBaseWidth(18,api.flightBuildingRegionSettings(two,'default').zoomPoints),150);
  const other=api.withFlightBuildingZoomPoint(api.flightBuildingRegionSettings(two,'default'),18,600);
  const three=api.withFlightBuildingRegionSettings(two,'default',other);
  assert.equal(api.flightBuildingBaseWidth(18,api.flightBuildingRegionSettings(three,'mykonos').zoomPoints),320);
  assert.equal(api.flightBuildingBaseWidth(18,api.flightBuildingRegionSettings(three,'syros').zoomPoints),85);
  assert.equal(JSON.stringify(settings),before);
  assert.equal(one.regions.syros,undefined);assert.equal(two.zoomPoints,undefined);
  const rootOnly=api.withFlightBuildingRegionSettings(settings,'default',{...settings,zoomPoints:[[18,700]]});
  assert.equal(api.flightBuildingBaseWidth(18,api.flightBuildingRegionSettings(rootOnly,'mykonos').zoomPoints),70,'unconfigured island keeps its approved curve instead of inheriting later mainland edits');
  const reset=api.withFlightBuildingRegionSettings(one,'mykonos',{...mykonos,zoomPoints:undefined});
  assert.equal(api.flightBuildingBaseWidth(18,api.flightBuildingRegionSettings(reset,'mykonos').zoomPoints),70,'reset returns to approved shared island curve, not mainland curve');
});
test('billboards choose regional settings per own artwork ID even when several regions share one view',async()=>{
  const markers=[];
  class Element{constructor(){this.style={};this.dataset={};}appendChild(){}setAttribute(){}removeAttribute(){}remove(){}}
  class Marker{constructor(options){Object.assign(this,options);markers.push(this);}}
  let profiles=api.withFlightBuildingRegionSettings(settings,'mykonos',{...settings,zoomPoints:[[18,320]]});
  profiles=api.withFlightBuildingRegionSettings(profiles,'syros',{...settings,zoomPoints:[[18,85]]});
  const points=[point,{...point,id:'GR-MYKONOS-036'},{...point,id:'GR-SYROS-001'}];
  const layer=await api.createFlightBuildings({maps:{importLibrary:async()=>({AdvancedMarkerElement:Marker})}}, {},{
    points,doc:{createElement:()=>new Element()},image:id=>'/own/'+id,
  });
  layer.update(plane,18,profiles);
  const width=id=>markers.find(m=>m.content.dataset.flightBuildingId===id).content.style.width;
  assert.equal(width(point.id),'150.00px');assert.equal(width('GR-MYKONOS-036'),'320.00px');assert.equal(width('GR-SYROS-001'),'85.00px');
  assert.equal(api.flightBuildingRegion('GR-MYKONOS-036'),'mykonos');assert.equal(api.flightBuildingRegion('GR-SYROS-001'),'syros');assert.equal(api.flightBuildingRegion(point.id),'default');
  layer.dispose();
});
test('image load/error readiness works without decode(), failed images can retry and callbacks detach on exit',async()=>{
  const markers=[];let changes=0;
  class Element{constructor(){this.style={};this.dataset={};this.attrs={};this.naturalWidth=0;}appendChild(child){if(!this.child)this.child=child;}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}remove(){}decode(){throw Error('must not depend on image.decode');}}
  class Marker{constructor(options){Object.assign(this,options);markers.push(this);}}
  const host=new Element(),points=[point,{...point,id:'second'}];
  const layer=await api.createFlightBuildings({maps:{importLibrary:async()=>({AdvancedMarkerElement:Marker})}}, {getDiv:()=>host}, {
    points,doc:{createElement:()=>new Element()},image:id=>'/own/'+id+'.webp',onChange:()=>changes++,
  });
  let info=layer.update(plane,18,settings);assert.equal(info.pending,2);assert.equal(info.loaded,0);assert.equal(info.failed,0);
  const good=markers[0].content.child,bad=markers[1].content.child;
  good.naturalWidth=512;good.onload();bad.onerror();
  info=layer.update(plane,18,settings);assert.equal(info.loaded,1);assert.equal(info.failed,1);assert.equal(info.pending,0);
  assert.equal(host.attrs['data-flight-building-loaded'],'1');assert.equal(host.attrs['data-flight-building-failed'],'1');
  const originalGood=good.src;layer.retryFailed();assert.equal(good.src,originalGood);assert.match(bad.src,/flight-retry=/);
  info=layer.update(plane,18,settings);assert.equal(info.pending,1);assert.equal(info.failed,0);
  bad.naturalWidth=512;bad.onload();info=layer.update(plane,18,settings);assert.equal(info.loaded,2);
  assert.equal(good.loading,'eager');assert.equal(good.decoding,'async');
  const changed=changes;layer.dispose();assert.equal(good.onload,null);assert.equal(bad.onerror,null);layer.retryFailed();assert.equal(changes,changed);
  assert.equal(host.attrs['data-flight-building-count'],undefined);
});
