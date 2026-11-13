const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets/landmarks/islands');
const source = JSON.parse(fs.readFileSync(path.join(assets, 'sources/locations.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'manifest.json'), 'utf8'));
function load(name, requireModule = () => { throw new Error('Unexpected dependency'); }) {
  const exports = {};
  const code = fs.readFileSync(path.join(root, 'lib/city', `${name}.ts`), 'utf8');
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, { exports, require: requireModule });
  return exports;
}
const islands = load('islandLandmarks.generated');
const images = load('islandLandmarkImages.generated', name => {
  const file = path.resolve(root, 'lib/city', name);
  assert.ok(fs.existsSync(file), `Missing artwork: ${name}`);
  return file;
});
const dependencies = {
  './islandLandmarks.generated': islands,
  './islandLandmarkImages.generated': images,
  './supplementLandmarks.generated': load('supplementLandmarks.generated'),
  './originalLandmarks.generated': load('originalLandmarks.generated'),
  './supplementLandmarkImages.generated': load('supplementLandmarkImages.generated', name => name),
  './originalLandmarkImages.generated': load('originalLandmarkImages.generated', name => name),
  './mapPresentation': load('mapPresentation'),
};
const landmarks = load('landmarks', name => {
  assert.ok(dependencies[name], `Unexpected dependency: ${name}`);
  return dependencies[name];
});

test('all 222 island landmarks are available alongside the unchanged Magdeburg sets', () => {
  const rows = islands.ISLAND_LANDMARKS;
  assert.equal(rows.length, 222);
  assert.equal(rows.filter(row => row.island === 'Syros').length, 127);
  assert.equal(rows.filter(row => row.island === 'Mykonos').length, 95);
  assert.equal(new Set(landmarks.ALL_LANDMARKS.map(row => row.id)).size, landmarks.ALL_LANDMARKS.length);
  assert.equal(landmarks.ALL_LANDMARKS.length,
    rows.length + landmarks.SUPPLEMENT_LANDMARKS.length + landmarks.ORIGINAL_LANDMARKS.length);
});

test('every displayed name, coordinate and Google target matches its source record', () => {
  source.locations.forEach((original, index) => {
    const row = islands.ISLAND_LANDMARKS[index];
    assert.equal(row.sourceId, original.id);
    assert.equal(row.name, original.display_name || original.name || original.icon_label);
    assert.equal(row.latitude, original.latitude);
    assert.equal(row.longitude, original.longitude);
    assert.equal(row.address, original.address || '');
    assert.equal(row.sourceUrl, original.source_url);
    const url = new URL(row.googleMapsUrl);
    assert.equal(url.origin, 'https://www.google.com');
    assert.equal(url.searchParams.get('query'), `${row.latitude},${row.longitude}`);
  });
});

test('each island has exactly one registered image per landmark and original lookups still work', () => {
  assert.equal(Object.keys(images.ISLAND_LANDMARK_IMAGES).length, 222);
  for (const row of islands.ISLAND_LANDMARKS) {
    const image = landmarks.landmarkImageSource(row.id);
    assert.equal(path.basename(image), row.imageFile);
    assert.equal(image, images.ISLAND_LANDMARK_IMAGES[row.id]);
  }
  for (const row of [...landmarks.SUPPLEMENT_LANDMARKS, ...landmarks.ORIGINAL_LANDMARKS]) {
    assert.ok(landmarks.landmarkImageSource(row.id), row.id);
  }
});

test('island viewport filtering retains exact positions, with no averaging or grouping', () => {
  const bounds = { minLat: 37, maxLat: 38, minLng: 24, maxLng: 26 };
  const visible = landmarks.ALL_LANDMARKS.filter(row => landmarks.landmarkIntersectsBounds(row, bounds, 14));
  assert.equal(visible.length, 222);
  for (const zoom of [10, 14, 16, 18]) {
    const groups = landmarks.clusterLandmarks(visible, zoom);
    assert.equal(groups.length, 222);
    groups.forEach((group, i) => {
      assert.equal(group.items.length, 1);
      assert.equal(group.id, visible[i].id);
      assert.equal(group.latitude, visible[i].latitude);
      assert.equal(group.longitude, visible[i].longitude);
    });
  }
});

test('source sheets and all extracted artwork match their audited hashes', () => {
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(hash(path.join(assets, 'sources/locations.json')), manifest.locationsSha256);
  assert.equal(manifest.icons.length, 222);
  for (const sheet of manifest.sheets) assert.equal(hash(path.join(assets, 'sources', sheet.file)), sheet.sha256);
  for (const icon of manifest.icons) {
    assert.equal(hash(path.join(assets, icon.imageFile)), icon.sha256);
    assert.ok(icon.opaquePixels > 4000);
    assert.ok(icon.size[0] > 16 && icon.size[1] > 16);
  }
});

test('web and native taps feed the same landmark ID into the gateway destination flow', () => {
  const gateway = fs.readFileSync(path.join(root, 'components/city/CityGatewayScreen.tsx'), 'utf8');
  assert.match(gateway, /landmarks=\{sceneLandmarks\}/);
  assert.match(gateway, /ALL_LANDMARKS\.find\(l => `landmark:\$\{l\.id\}` === id\)/);
  assert.match(gateway, /latitude: landmark\.latitude, longitude: landmark\.longitude, kind: "place"/);
  for (const platform of ['web', 'native']) {
    const map = fs.readFileSync(path.join(root, `components/BusinessMap.${platform}.tsx`), 'utf8');
    assert.match(map, platform === 'web' ? /landmarkImageSource\(item\.id\)/ : /landmarkImageSource\(group\.id\)/);
    assert.match(map, /`landmark:\$\{/);
  }
});

test('all island artwork follows the distant Magdeburg scale, shrinks to town streets and then holds its smaller size',()=>{
  const id='GR-SYROS-001';
  for(const zoom of [10,12,14,15,16,16.99]){
    const appearance=landmarks.landmarkAppearance(zoom,id);
    assert.equal(appearance.detail,false);assert.ok(appearance.size<=115);
  }
  assert.equal(landmarks.landmarkAppearance(17,id).detail,true);
  assert.equal(landmarks.landmarkAppearance(14,id).size,landmarks.landmarkAppearance(14).size);
  assert.ok(landmarks.landmarkAppearance(14,id).size>landmarks.landmarkAppearance(16,id).size);
  assert.equal(landmarks.landmarkAppearance(17,id).size,42);
  assert.equal(landmarks.landmarkAppearance(18,id).size,42);
  assert.equal(landmarks.landmarkAppearance(23,id).size,42);
  assert.equal(landmarks.landmarkAppearance(23,id).size,landmarks.landmarkAppearance(20,id).size);
  assert.equal(landmarks.LANDMARK_MAP_MAX_ZOOM,23);
  assert.equal(landmarks.landmarkAppearance(18).size,825,'Magdeburg retains its existing artwork curve');
  for(const platform of ['web','native']){
    const code=fs.readFileSync(path.join(root,`components/BusinessMap.${platform}.tsx`),'utf8');
    assert.match(code,platform==='web'?/maxZoom: LANDMARK_MAP_MAX_ZOOM/:/maxZoomLevel=\{LANDMARK_MAP_MAX_ZOOM\}/);
    assert.match(code,/landmarkTapTargets/);
  }
});

test('island labels do not overlap and more names become readable as the camera separates dense points',()=>{
  const viewer={latitude:37.4451,longitude:24.9427};
  const points=[{...viewer,id:'GR-SYROS-A',name:'First nearby building'},
    {...viewer,longitude:viewer.longitude+.00004,id:'GR-SYROS-B',name:'Second nearby building'},
    {...viewer,latitude:viewer.latitude+.01,id:'GR-SYROS-C',name:'Distant building'}];
  const before=JSON.stringify(points);
  const names=zoom=>[...landmarks.landmarkDepthLayout(points,[],zoom,viewer).values()].filter(row=>row.showLabel).length;
  assert.equal(names(16.99),0);assert.equal(names(17),2);assert.equal(names(23),3);
  assert.equal(JSON.stringify(points),before);
});

test('category focus blurs all buildings and hides their names without touching source positions',()=>{
  const viewer={latitude:37.4451,longitude:24.9427};
  const points=[{...viewer,id:'GR-SYROS-A',name:'Island building'},{...viewer,id:'MD-X001',name:'Other building'}];
  const before=JSON.stringify(points);
  for(const depth of landmarks.landmarkDepthLayout(points,[],23,viewer,0,true).values()){
    assert.equal(depth.opacity,.18);assert.equal(depth.blur,3);assert.equal(depth.showLabel,false);
  }
  assert.equal(JSON.stringify(points),before);
  const restored=landmarks.landmarkDepthLayout(points,[],23,viewer);
  assert.equal(restored.get('GR-SYROS-A').opacity,.3);assert.equal(restored.get('GR-SYROS-A').blur,2.4);
});
test('island images fade and blur from the small-street reference while their names stay sharp and present',()=>{
  const viewer={latitude:37.4451,longitude:24.9427},items=[{...viewer,id:'GR-MYKONOS-A',name:'Island building'}];
  const before=JSON.stringify(items),edge=landmarks.ISLAND_ALLEY_DETAIL_ZOOM;
  const clear=landmarks.landmarkDepthLayout(items,[],edge-.01,viewer).get(items[0].id);
  const street=landmarks.landmarkDepthLayout(items,[],edge,viewer).get(items[0].id);
  const close=landmarks.landmarkDepthLayout(items,[],edge+2,viewer).get(items[0].id);
  assert.equal(clear.blur,0);assert.equal(clear.opacity,1);assert.equal(clear.showLabel,true);
  assert.equal(street.blur,1.2);assert.equal(street.opacity,.3);assert.equal(street.showLabel,true);
  assert.equal(close.blur,2.4);assert.equal(close.opacity,.3);assert.equal(close.showLabel,true);
  assert.equal(JSON.stringify(items),before);
});

test('a building tap never becomes a proximity composite, including at exactly co-located anchors',()=>{
  const point={latitude:37.4451,longitude:24.9427};
  const rows=[{...point,id:'GR-SYROS-A'},{...point,id:'GR-SYROS-B'},{latitude:37.5,longitude:24.9,id:'GR-SYROS-C'}];
  const before=JSON.stringify(rows);
  assert.deepEqual(Array.from(landmarks.landmarkTapTargets(rows[0],rows,23),row=>row.id),['GR-SYROS-A']);
  assert.equal(JSON.stringify(rows),before);
});

test('every island building remains drawn independently at all zoom levels without crowding-based hiding',()=>{
  const viewer={latitude:37.4451,longitude:24.9427};
  const rows=[{...viewer,id:'GR-SYROS-A'},
    {...viewer,longitude:viewer.longitude+.00004,id:'GR-SYROS-B'},
    {...viewer,longitude:viewer.longitude+.000065,id:'GR-SYROS-C'}];
  const visible=zoom=>[...landmarks.landmarkDepthLayout(rows,[],zoom,viewer).entries()]
    .filter(([,depth])=>depth.showArtwork).map(([id])=>id);
  for(const zoom of [10,12,14,15,16,17,18,19,20,21,22,23])assert.equal(visible(zoom).length,3);
  for(const zoom of [18,19,20,21,22,23]){
    const groups=landmarks.clusterLandmarks(rows,zoom);
    assert.ok(groups.every(group=>group.items.length===1));
  }
});
test('the ordinary-street plateau remains sharp until the calibrated finer-lane boundary',()=>{
  const viewer={latitude:37.4451,longitude:24.9427},items=[{...viewer,id:'GR-SYROS-A',name:'Building'}];
  for(const zoom of [17,17.1,17.5,17.99]){
    const depth=landmarks.landmarkDepthLayout(items,[],zoom,viewer).get(items[0].id);
    assert.equal(landmarks.landmarkAppearance(zoom,items[0].id).size,42);
    assert.equal(depth.opacity,1);assert.equal(depth.blur,0);assert.equal(depth.showArtwork,true);
  }
  for(const zoom of [18,19,20,21,22,23]){
    const depth=landmarks.landmarkDepthLayout(items,[],zoom,viewer).get(items[0].id);
    assert.equal(landmarks.landmarkAppearance(zoom,items[0].id).size,42);
    assert.equal(depth.opacity,.3);assert.ok(depth.blur>=1.2);assert.equal(depth.showArtwork,true);
  }
});
