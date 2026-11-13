const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/city/landmarks.ts'), 'utf8');
const landmarkModule = {};
const presentationModule={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/city/mapPresentation.ts'),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:presentationModule});
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText, { exports: landmarkModule, require: name => ({
  './supplementLandmarks.generated': { SUPPLEMENT_LANDMARKS: [] },
  './originalLandmarks.generated': { ORIGINAL_LANDMARKS: [] },
  './islandLandmarks.generated': { ISLAND_LANDMARKS: [] },
  './supplementLandmarkImages.generated': { SUPPLEMENT_LANDMARK_IMAGES: {} },
  './originalLandmarkImages.generated': { ORIGINAL_LANDMARK_IMAGES: {} },
  './islandLandmarkImages.generated': { ISLAND_LANDMARK_IMAGES: {} },
  './mapPresentation':presentationModule,
}[name] || {}) });

test('overlapping landmarks always retain separate IDs and their exact original anchors', () => {
  const landmarks = [
    { id: 'statue', latitude: 52.13, longitude: 11.63 },
    { id: 'park', latitude: 52.1307, longitude: 11.63 }, // ~78 m away
    { id: 'museum', latitude: 52.134, longitude: 11.63 },
  ];
  const groups = landmarkModule.clusterLandmarks(landmarks, 15);
  assert.equal(groups.length, 3);
  for(let i=0;i<groups.length;i++){
    assert.equal(groups[i].items.length,1);assert.equal(groups[i].latitude,landmarks[i].latitude);
    assert.equal(groups[i].longitude,landmarks[i].longitude);assert.equal(groups[i].id,landmarks[i].id);
  }
  assert.deepEqual(Array.from(groups, x => Array.from(x.items, y => y.id)).flat().sort(), ['museum', 'park', 'statue']);
});

test('zoom never merges even co-located artwork', () => {
  const landmarks = [
    { id: 'one', latitude: 52.13, longitude: 11.63 },
    { id: 'two', latitude: 52.1307, longitude: 11.63 },
  ];
  for(const z of [3,10,14,15,17,19,21])assert.equal(landmarkModule.clusterLandmarks(landmarks,z).length,2);
});

test('buildings shrink through the dot-to-shelter approach and already reach 1x without a jump',()=>{
  const size=z=>landmarkModule.landmarkAppearance(z).size;
  assert.equal(size(14),46*2.5);assert.equal(size(14.5),84.5);
  assert.equal(size(12),38);assert.equal(size(10),12);assert.ok(size(6)<size(8));
  const boundary=presentationModule.STOP_ARTWORK_ZOOM;
  assert.equal(presentationModule.transitStopAppearance(boundary-.001).dot,true);
  assert.equal(presentationModule.transitStopAppearance(boundary).dot,false);
  assert.ok(size(boundary-.001)>54);assert.ok(size(boundary-.001)<55);
  assert.equal(size(boundary),54,'1x is the original artwork size at this zoom');
  assert.equal(landmarkModule.landmarkAppearance(boundary).detail,true,'building names appear from 1x');
  assert.equal(landmarkModule.landmarkAppearance(boundary-.001).detail,false,'distant dot tier stays uncluttered');
  assert.ok(size(boundary+.001)>54);assert.ok(size(boundary+.001)<55);
  assert.ok(Math.abs(size(boundary-.001)-size(boundary+.001))<.1,'no sudden reset when pins become shelters');
  let previous=size(14);
  for(let z=14.01;z<boundary;z+=.01){assert.ok(size(z)<previous);previous=size(z);}
  assert.equal(landmarkModule.landmarkAppearance(17).detail,true);
});

test('after reset, artwork grows smoothly to its maximum at house-number reference zoom and stays bounded',()=>{
  const size=z=>landmarkModule.landmarkAppearance(z).size;
  const start=presentationModule.STOP_ARTWORK_ZOOM,end=landmarkModule.LANDMARK_MAX_DETAIL_ZOOM;
  assert.equal(end,18);assert.equal(size(end),66*12.5);assert.ok(size(end)>375);
  let previous=size(start);
  for(let z=start+.025;z<=end;z+=.025){const value=size(z);assert.ok(value>previous);assert.ok(value-previous<25);previous=value;}
  assert.ok(size(16)>54&&size(16)<size(17));assert.ok(size(17)<825);
  for(const z of [18,19,20,22])assert.equal(size(z),825);
  // Pure zoom state: the same boundary works on reverse zoom or revisiting.
  for(const z of [17,15,18,14.5,15,16])assert.equal(size(z),landmarkModule.landmarkAppearance(z).size);
});

test('buildings stay below pins; street-detail blur starts independently of stop lettering',()=>{
  const viewer={latitude:52.13,longitude:11.63};
  const items=[{id:'near',latitude:52.1301,longitude:11.63},{id:'mid',latitude:52.1302,longitude:11.63},
    {id:'far',latitude:52.1303,longitude:11.63}];
  const layout=landmarkModule.landmarkDepthLayout(items,[],17,viewer);
  assert.equal(layout.size,3);assert.ok(layout.get('near').zIndex>layout.get('mid').zIndex);
  assert.ok(layout.get('mid').zIndex>layout.get('far').zIndex);
  for(const z of [14,15,16,17,18,19]){
    for(const value of landmarkModule.landmarkDepthLayout(items,[],z,viewer).values()){
      assert.equal(value.opacity,z>=landmarkModule.LANDMARK_STREET_DETAIL_ZOOM ? .3 : 1);
      assert.equal(value.blur,z>=landmarkModule.LANDMARK_STREET_DETAIL_ZOOM?1.2:0);
      assert.ok(value.zIndex<presentationModule.MAP_LAYERS.route);
    }
  }
});

test('an actual stop under a building reveals it and camera rotation updates overlap, not coordinates',()=>{
  const viewer={latitude:52.13,longitude:11.63},item={id:'one',latitude:52.13,longitude:11.63};
  const before=JSON.stringify(item),pin={latitude:52.1303,longitude:11.63,name:'Station'};
  const front=landmarkModule.landmarkDepthLayout([item],[pin],17,viewer,0).get('one');
  assert.equal(front.revealsPin,true);assert.ok(front.opacity<1);assert.ok(front.blur>0);
  const reversed=landmarkModule.landmarkDepthLayout([item],[pin],17,viewer,180).get('one');
  assert.equal(reversed.revealsPin,false);assert.equal(JSON.stringify(item),before);
});

test('street-detail fade reveals roads before stop lettering, and stop overlap adds extra transparency',()=>{
  const viewer={latitude:52.13,longitude:11.63},items=[{id:'one',...viewer}];
  const stops=[{latitude:52.1303,longitude:11.63,name:'Station'}];
  for(const z of [10,14,14.999,15,16,16.999]){
    assert.equal(presentationModule.transitStopAppearance(z).names,false);
    const depth=landmarkModule.landmarkDepthLayout(items,stops,z,viewer).get('one');
    assert.equal(depth.opacity,z>=landmarkModule.LANDMARK_STREET_DETAIL_ZOOM ? .3 : 1);
    assert.equal(depth.blur,z>=landmarkModule.LANDMARK_STREET_DETAIL_ZOOM?1.2:0);assert.equal(depth.revealsPin,false);
  }
  assert.equal(presentationModule.transitStopAppearance(17).names,true);
  assert.ok(landmarkModule.landmarkDepthLayout(items,stops,17,viewer).get('one').blur>0);
  const far=landmarkModule.landmarkDepthLayout(items,[{latitude:53,longitude:12,name:'Unrelated'}],18,viewer).get('one');
  assert.equal(far.opacity,.3);assert.equal(far.blur,1.2);
});

test('large buildings with offscreen anchors remain in the native overscan',()=>{
  const bounds={minLat:52.13,maxLat:52.131,minLng:11.63,maxLng:11.631};
  assert.equal(landmarkModule.landmarkIntersectsBounds({latitude:52.1312,longitude:11.63},bounds,19),true);
  assert.equal(landmarkModule.landmarkIntersectsBounds({latitude:53,longitude:12},bounds,19),false);
});
