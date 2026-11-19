const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.join(__dirname,'..');
test('aircraft embeds small PNG textures and requires no external texture/decoder downloads',()=>{
  const b=fs.readFileSync(path.join(root,'assets/game/perix-airplane-characters-animated.glb'));
  const n=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+n)),base=28+n;
  assert.ok(!g.extensionsRequired?.length,'no required KTX/Draco/browser-specific decoder');
  assert.equal(g.images.length,4);
  for(const image of g.images){
    assert.equal(image.mimeType,'image/png');assert.equal(image.uri,undefined);
    const view=g.bufferViews[image.bufferView],offset=base+(view.byteOffset||0);
    assert.equal(b.toString('ascii',offset+1,offset+4),'PNG');
    const width=b.readUInt32BE(offset+16),height=b.readUInt32BE(offset+20);
    assert.ok(width>0&&height>0&&width<=2048&&height<=2048,'conservative mobile GPU texture dimensions');
  }
});
test('every Mykonos/Syros catalogue point has bundled own WebP artwork with no remote image requirement',()=>{
  const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'lib/city/islandLandmarks.generated.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
  const source=fs.readFileSync(path.join(root,'lib/city/islandLandmarkImages.generated.ts'),'utf8');
  const images=new Map([...source.matchAll(/'([^']+)': require\('([^']+)'\)/g)].map(m=>[m[1],m[2]]));
  const points=exports.ISLAND_LANDMARKS;assert.ok(points.length>0);
  for(const point of points){
    const rel=images.get(point.id);assert.ok(rel,point.id);assert.ok(rel.startsWith('../../assets/'));
    const b=fs.readFileSync(path.resolve(root,'lib/city',rel));
    assert.equal(b.toString('ascii',0,4),'RIFF',point.id);assert.equal(b.toString('ascii',8,12),'WEBP',point.id);assert.ok(b.length>100);
  }
});
