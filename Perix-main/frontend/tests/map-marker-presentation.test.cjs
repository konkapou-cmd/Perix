const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const out={};vm.runInNewContext(ts.transpileModule(read('lib/city/mapPresentation.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});
const {transitStopAppearance,mapEntityPinSize,profileInitial,createUserPinElement,perspectiveMultiplier,routeWeightForZoom,LOCKED_MAP_TILT,RASTER_FALLBACK_TILT,lockedTiltForRendering,PERIX_VECTOR_MAP_ID}=out;

test('vehicles, stops, entity pins and compass use layers above every building on both renderers',()=>{
  const layers=out.MAP_LAYERS;
  for(const key of ['stop','pin','vehicle','selection','user'])assert.ok(layers[key]>layers.landmark);
  const web=read('components/BusinessMap.web.tsx'),native=read('components/BusinessMap.native.tsx');
  const building=web.slice(web.indexOf('class LandmarkOverlay'),web.indexOf('const labelStops'));
  assert.match(building,/getPanes\(\)\.overlayLayer\.appendChild/);
  assert.doesNotMatch(building,/overlayMouseTarget/);
  assert.match(web,/container\.style\.zIndex=String\(MAP_LAYERS\.stop\)/);
  assert.match(web,/selectionCompass\?MAP_LAYERS\.selection:MAP_LAYERS\.pin/);
  assert.match(web,/pointerEvents:'auto'/,'building names remain clickable');
  for(const key of ['stop','pin','vehicle','selection','user'])assert.ok(native.includes('MAP_LAYERS.'+key));
  assert.match(native,/action==='marker-press'/,'native marker taps must not also select a background Google destination');
  assert.match(native,/event\.stopPropagation\(\);onTransitStopPress/);
  assert.match(read('components/VisualTransitMarker.native.tsx'),/zIndex=\{MAP_LAYERS\.vehicle\}/);
  const compass=web.slice(web.indexOf('if (!isGroup && group.items[0].selectionCompass)'),web.indexOf('} else if (isGroup)'));
  assert.match(compass,/markersRef\.current\.push/,'old compasses participate in overlay cleanup on replacement/close');
});

test('far zoom shows small light-blue pins; close zoom shows the illustrated stop with codes and name',()=>{
  for(const zoom of [8,10,12,14,14.9]){
    const a=transitStopAppearance(zoom);
    assert.equal(a.dot,true);assert.ok(a.size>0&&a.size<11);assert.equal(a.color,'#59ABE3');
    assert.equal(a.names,false);assert.equal(a.platforms,false);
  }
  for(const zoom of [15,15.1,16,16.9]){
    const a=transitStopAppearance(zoom);
    assert.equal(a.dot,false);assert.ok(a.icon>=10&&a.icon<36);
    assert.equal(a.names,false);assert.equal(a.platforms,false);
  }
  for(const zoom of [17,18,20]){
    const a=transitStopAppearance(zoom);
    assert.equal(a.dot,false);assert.equal(a.icon,36);
    assert.equal(a.names,true);assert.equal(a.platforms,true);
    assert.equal(a.color,'#59ABE3');
  }
  // Labels only appear at sufficient close zoom; geographic pins never move.
  assert.ok(transitStopAppearance(12).size<transitStopAppearance(14.9).size);
  assert.ok(transitStopAppearance(15).icon<transitStopAppearance(16.9).icon);
  assert.deepEqual(transitStopAppearance(17),transitStopAppearance(20));
});
test('stop appearance is stable inside a zoom bucket and contains no physical network filtering',()=>{
  const web=read('components/BusinessMap.web.tsx'),native=read('components/BusinessMap.native.tsx');
  assert.match(web,/transitStopAppearance\(zoom\)/);assert.match(native,/transitStopAppearance\(zoomLevel\)/);
  assert.match(web,/container\.dataset\.platformId/);assert.match(native,/onTransitStopPress\?\.\(stop\)/);
  assert.match(web,/codes\.textContent=Array\.from\(new Set\(platformCodes\)\)\.join\(" · "\)/);
  assert.match(native,/stopPlatformCodes/);
  assert.doesNotMatch(web,/b\.textContent = r\.route_number/);
  assert.doesNotMatch(native,/\{r\.route_number\}/);
  assert.doesNotMatch(native,/zoomLevel >= 12 &&\s*transitStops/);
  assert.match(web,/if \(!overlayProjection\) return;/);
  assert.match(web,/paintTier/);assert.match(web,/backgroundColor: "#59ABE3"/);
  assert.match(web,/labels\.style\.display = tier\.names \? "flex" : "none"/,'web text respects the separate close-zoom tier');
  assert.match(native,/stopAppearance\.names && <Text/);
  assert.match(native,/stopAppearance\.platforms && !!platformLabel/);
  assert.match(native,/backgroundColor:'#59ABE3'/);
  assert.match(web,/dot\.style\.width=size\+'px';dot\.style\.height=size\+'px';/,'stop dots scale from the tier size with POV perspective');assert.match(native,/width:stopAppearance\.size/);
});
test('directory pins use round entity images and grow with zoom without becoming oversized',()=>{
  const sizes=[8,10,12,14,16,18,20,24].map(z=>mapEntityPinSize(z));
  assert.ok(sizes[0]>=24&&sizes.at(-1)<=44);
  assert.ok(sizes.every((value,index)=>!index||value>=sizes[index-1]));
  assert.equal(sizes[3],sizes[0]);assert.ok(sizes[5]>sizes[3]);
  const gateway=read('components/city/CityGatewayScreen.tsx');
  assert.match(gateway,/pinImage: markerProfileImage\(r\)/);
  for(const file of ['components/BusinessMap.native.tsx','components/BusinessMap.web.tsx']){
    const source=read(file);assert.match(source,/pinImage/);assert.match(source,/mapEntityPinSize/);
  }
  assert.match(read('components/BusinessMap.native.tsx'),/DirectoryPinArt source=\{item\.pinImage!/);
  assert.match(read('components/BusinessMap.web.tsx'),/avatar\.style\.objectFit=imageFit/);
  assert.equal(mapEntityPinSize(14),33);
  assert.equal(mapEntityPinSize(18,19),33);assert.ok(mapEntityPinSize(20,19)>33);
});
test('auto-fit camera frames the origin and approaching vehicles and cancels on any user gesture',()=>{
  const web=read('components/BusinessMap.web.tsx');
  assert.match(web,/setZoom\(next.target.zoom\)/);
  assert.match(web,/dragstart/);assert.match(web,/pointerdown/);assert.match(web,/touchstart/);assert.match(web,/wheel/);assert.match(web,/keydown/);
  assert.match(web,/advanceAutoCamera/,'camera cancellation and refits use the shared lifecycle');
  const native=read('components/BusinessMap.native.tsx');
  assert.match(native,/animateCamera/);assert.match(native,/onPanDrag/);assert.match(native,/onTouchStart/);
  const gateway=read('components/city/CityGatewayScreen.tsx');
  assert.match(gateway,/autofit=\{autofit\}/);
  assert.match(gateway,/token: focusToken/);
});
test('fleet polls retain stationary overlays and their click handlers resolve the latest selection callback',()=>{
  const web=read('components/BusinessMap.web.tsx');
  assert.match(web,/existingPins\.set\(rec\.pinKey, rec\)/);
  assert.match(web,/existing\?\.pinSignature === signature && existing\.map === mapRef\.current/);
  assert.match(web,/markersRef\.current\.push\(existing\);\s*return;/);
  assert.match(web,/existingPins\.forEach\(record => record\.overlay\?\.setMap\(null\)\)/);
  assert.match(web,/onMarkerPressRef\.current\?\.\(group\.items\[0\]\.id\)/);
  assert.match(web,/rec\?\.resize\?\.\(s, vs, z\)/,'zoom and tilt resize markers in place with shared scales');
});
test('same-address groups use the first profile image, a count badge and the same base size as individual pins',()=>{
  const web=read('components/BusinessMap.web.tsx'),native=read('components/BusinessMap.native.tsx');
  assert.match(web,/pin\.dataset\.addressProfileGroup="true"/);
  assert.match(web,/count\.textContent=String\(group\.count\)/);
  assert.match(web,/pinImage: items\[0\]\.pinImage/);
  assert.match(native,/source=\{first\.pinImage \|\| ''\}/);
  assert.match(native,/>\{group\.count\}<\/Text>/);
  assert.doesNotMatch(web,/mapEntityPinSize\(level\)\*1\.15/);
  assert.doesNotMatch(native,/mapEntityPinSize\(zoomLevel\)\*1\.15/);
  for(const source of [web,native])assert.match(source,/const key = mapMarkerGroupKey\(m\)/);
});
test('emblem pins resolve subcategory artwork, render larger with profile medallion and name',()=>{
  assert.equal(out.mapEmblemPinSize(14),41);assert.ok(out.mapEmblemPinSize(20)>mapEntityPinSize(20));
  assert.ok(out.mapEmblemPinSize(30)<=52);
  const emblemKey = (input) => {
    const ref = out.businessEmblemKey(input);
    return ref ? `${ref.kind}:${ref.key}` : null;
  };
  assert.equal(emblemKey({root_category:'food-dining',subcategory:'cafes',subcategories:['pizza']}),'business-subcategory:pizza');
  assert.equal(emblemKey({root_category:'food-dining'}),'business-root:food-dining');
  assert.equal(emblemKey({}),null);
  const candidates = (input) => out.directoryEmblemCandidates(input).map(ref => `${ref.kind}:${ref.key}`).join(',');
  assert.equal(candidates({type:'public_service',publicService:{subcategory_ids:['x']}}),'public-service:x');
  assert.equal(candidates({type:'public_service',publicService:{subcategory_ids:[]}}),'public-service:government-administration');
  assert.equal(candidates({type:'business',category_ids:['food-dining','cafes']}),'business-subcategory:cafes,business-root:food-dining');
  assert.equal(candidates({type:'event',category_ids:['arts-event']}),'');
  const web=read('components/BusinessMap.web.tsx'),native=read('components/BusinessMap.native.tsx');
  for(const source of [web,native]){
    assert.match(source,/emblem\?: ImageSourcePropType \| null/);
    assert.match(source,/businessEmblemKey\(business/);
    assert.match(source,/emblem: businessEmblem\(business/);
    assert.match(source,/emblem: items\[0\]\.emblem/);
    assert.match(source,/mapEmblemPinSize\(/);
  }
  assert.match(web,/pinNameLabel/);
  assert.match(native,/pin-name-label/);
  assert.match(web,/pin\.dataset\.emblemPin = "true"/);
  assert.match(web,/resolveMapAssetUri\(group\.emblem\)/);
  assert.match(web,/\|emblem\$\{m\.emblem \? 1 : 0\}/);
  assert.match(native,/<EmblemPinArt emblem=\{group\.emblem}/);
  assert.match(native,/photo=\{first\.pinImage\} label=\{first\.title\} count=\{group\.count\}/);
  const gateway=read('components/city/CityGatewayScreen.tsx');
  assert.match(gateway,/directoryEmblemCandidates\(r\)\.map\(ref => illustratedIconSource\(ref\.kind, ref\.key\)\)/);
  const markers=read('lib/city/publicServices.ts');
  assert.match(markers,/PUBLIC_SERVICE_ILLUSTRATIONS\[r\.subcategory_ids\?\.\[0\] \|\| ""\] \?\? PUBLIC_SERVICE_ILLUSTRATIONS\["government-administration"\]/);
});
test('Home map selects pins card-first instead of navigating directly',()=>{
  const section=read('components/home/MapSection.tsx');
  assert.match(section,/const \[selectedId, setSelectedId\] = useState<string \| null>\(null\)/);
  assert.match(section,/if \(selectedId === id\) \{ navigateToEntity\(id\); return; \}/);
  assert.match(section,/testID="home-map-selected-card"/);
  assert.match(section,/testID="home-map-selected-close"/);
  assert.match(section,/<LocatorCard type="business" data=\{selected\.data\}/);
  assert.match(section,/onPress=\{\(\) => navigateToEntity\(selectedId\)\}/);
});
test('exact address keys combine differing coordinates without merging different addresses or moving vehicles',()=>{
  const a={id:'a',latitude:52.13,longitude:11.63,address:'  Breiter Weg 203–206, 39104 Magdeburg '};
  const b={id:'b',latitude:52.1301,longitude:11.6301,address:'breiter   weg 203–206, 39104 magdeburg'};
  assert.equal(out.mapMarkerGroupKey(a),out.mapMarkerGroupKey(b));
  assert.notEqual(out.mapMarkerGroupKey(a),out.mapMarkerGroupKey({...a,address:'Breiter Weg 200, 39104 Magdeburg'}));
  assert.notEqual(out.mapMarkerGroupKey({...a,type:'bus'}),out.mapMarkerGroupKey({...b,type:'bus'}));
  assert.notEqual(out.mapMarkerGroupKey({...a,selectionCompass:true}),out.mapMarkerGroupKey(a));
});
test('fallback initial respects Greek and accented names and never returns markup',()=>{
  assert.equal(profileInitial('  Γιώργος Παππάς'),'Γ');assert.equal(profileInitial('élise'),'É');assert.equal(profileInitial('alex'),'A');
  assert.equal(profileInitial(' '),'?');assert.equal(profileInitial(null),'?');assert.equal(profileInitial('<script>'),'<');
});
const doc={createElement:tag=>({tag,style:{},dataset:{},children:[],textContent:'',appendChild(node){this.children.push(node);}})};
test('missing photo gives a blue thumbnail with white initial at the same size as a photo pin',()=>{
  const pin=createUserPinElement(doc,null,'Anna');assert.equal(pin.textContent,'A');assert.equal(pin.children.length,0);
  assert.equal(pin.style.backgroundColor,'#59ABE3');assert.equal(pin.style.color,'#fff');assert.equal(pin.style.width,'34px');
});
test('profile photo failure reveals the initial instead of an empty blue circle',()=>{
  const pin=createUserPinElement(doc,'https://example.invalid/profile.png','Γιώργος');
  assert.equal(pin.children.length,1);const image=pin.children[0];assert.equal(image.src,'https://example.invalid/profile.png');
  image.onerror();assert.equal(image.style.display,'none');assert.equal(pin.textContent,'Γ');
  assert.equal(pin.dataset.userInitial,'Γ');
});
test('all three maps use the personal profile picture/name, not business identity or a selected focus point',()=>{
  for(const file of ['components/city/CityGatewayScreen.tsx','app/(tabs)/home.tsx','components/locator/LegacyLocatorScreen.tsx']){
    const source=read(file);assert.match(source,/userPinImage=\{user\?\.profile_photo \|\| user\?\.picture \|\| undefined\}/);
    assert.match(source,/userPinName=\{user\?\.name\}/);
  }
  const locator=read('components/locator/LegacyLocatorScreen.tsx');assert.match(locator,/pinLocation=\{livePosition\}/);
  assert.doesNotMatch(locator,/pinLocation=\{locateFocus/);
  const native=read('components/BusinessMap.native.tsx');assert.match(native,/onError=\{\(\)=>setPinImageFailed\(true\)\}/);
  assert.match(native,/profileInitial\(userPinName\)/);
});

test('tilt perspective scales markers by POV distance with clamps, lines by zoom',()=>{
  const map=(tilt,zoom=16,center={lat:()=>52.14,lng:()=>11.63},bounds={minLat:52,maxLat:52.3,minLng:11.5,maxLng:11.8})=>({getTilt:()=>tilt,getHeading:()=>0,getZoom:()=>zoom,getCenter:()=>center,getBounds:()=>({getSouthWest:()=>({lat:()=>bounds.minLat,lng:()=>bounds.minLng}),getNorthEast:()=>({lat:()=>bounds.maxLat,lng:()=>bounds.maxLng})})});
  assert.equal(perspectiveMultiplier(map(0),52.14,11.63),1);
  assert.equal(perspectiveMultiplier(null,52.14,11.63),1);
  assert.equal(perspectiveMultiplier(map(45),null,null),1);
  const near=perspectiveMultiplier(map(45),52.05,11.63),far=perspectiveMultiplier(map(45),52.25,11.63);
  assert.ok(near>1&&far<1&&near<=1.6&&far>=0.65);
  assert.ok(perspectiveMultiplier(map(67),52.0,11.63)<=1.6&&perspectiveMultiplier(map(67),52.3,11.63)>=0.65);
  assert.equal(routeWeightForZoom(2,14),2);
  assert.ok(routeWeightForZoom(5,18)>5&&routeWeightForZoom(5,18)<=9);
  assert.ok(routeWeightForZoom(2,8)>=1);
  const web=read('components/BusinessMap.web.tsx');
  assert.match(web,/tilt_changed/);
  assert.match(web,/refreshScales/);
  assert.match(web,/perspectiveMultiplier\(mapRef\.current/);
  assert.match(web,/routeWeightForZoom\(entry\?\.base/);
});

test('tilt is locked permanent and pedestrian mode is explicit with coverage',()=>{
  assert.equal(LOCKED_MAP_TILT,67);
  assert.equal(RASTER_FALLBACK_TILT,45);
  assert.equal(lockedTiltForRendering('VECTOR'),67);
  assert.equal(lockedTiltForRendering('RASTER'),45);
  assert.equal(lockedTiltForRendering('UNINITIALIZED'),67);
  assert.equal(PERIX_VECTOR_MAP_ID,"242086816079968f2dab4657");
  const web=read('components/BusinessMap.web.tsx');
  assert.match(web,/mapId: PERIX_VECTOR_MAP_ID/);
  assert.match(web,/tilt: LOCKED_MAP_TILT/);
  assert.match(web,/applyLockedTilt\(map\)/);
  assert.match(web,/lockedTiltForRendering\(target\.getRenderingType/);
  assert.match(web,/tilesloaded/);
  assert.match(web,/street-view-toggle/);
  assert.match(web,/StreetViewService[\s\S]*?getPanorama/);
  assert.match(web,/StreetViewSource\.OUTDOOR/);
  assert.match(web,/street-view-close/);
  assert.match(web,/if \(zoom < 19\) \{ setStreetView\(null\)/);
  assert.equal(web.split('setStreetView({').length - 1, 1, 'street view opens only from the coverage-checked callback');
});

test('soft light cinema grade overlays the frame without touching controls',()=>{
  const web=read('components/BusinessMap.web.tsx');
  assert.match(web,/perix-cinema-light-styles/);
  assert.match(web,/radial-gradient\(ellipse 65% 60% at 12% 4%,rgba\(255,240,207,0\.30\)/);
  assert.match(web,/radial-gradient\(ellipse 55% 50% at 85% 8%,rgba\(159,211,231,0\.13\)/);
  assert.match(web,/rgba\(79,64,52,0\.14\) 100%/);
  assert.match(web,/inset:0 0 48px 0/);
  assert.match(web,/pointer-events:none/);
  assert.match(web,/<div aria-hidden className="perix-cinema-light" \/>/);
  assert.match(web,/never inside the Cloud Map Style JSON/);
});
