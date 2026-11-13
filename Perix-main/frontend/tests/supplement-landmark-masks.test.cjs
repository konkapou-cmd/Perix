const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const maskPng=require('./helpers/read-mask-png.cjs'),root=path.join(__dirname,'../assets/landmarks');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'sources/supplement-mask-manifest.json'),'utf8'));
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
test('supplement source and zip ID mapping are preserved while old grid crops no longer trim artwork',()=>{
  assert.equal(manifest.icons.length,70);
  assert.equal(hash(fs.readFileSync(path.join(root,'sources',manifest.source_file))),manifest.source_sha256);
  const metadata=fs.readFileSync(path.join(root,'sources',manifest.locations_file));
  assert.equal(hash(metadata),manifest.locations_sha256);
  const original=JSON.parse(metadata).locations.sort((a,b)=>a.sheet_position-b.sheet_position);
  for(const [index,row] of manifest.icons.entries()){
    assert.equal(row.id,original[index].icon_id);assert.equal(row.sheet_position,index+1);
    assert.equal(row.original_opaque_pixels,row.preserved_opaque_pixels);
    assert.ok(row.main_component_pixels>4000);
    assert.equal(hash(fs.readFileSync(path.join(root,'supplement',row.id.toLowerCase()+'.webp'))),row.sha256);
  }
  assert.equal(manifest.source_opaque_pixels,manifest.preserved_opaque_pixels);
  assert.equal(manifest.restored_outside_old_crops,138417);
  assert.equal(manifest.icons.filter(row=>row.restored_opaque_pixels_outside_old_crop>0).length,56);
});
test('all 70 supplemental assets use lossless artwork masks with a transparent 8px safety border',()=>{
  for(const row of manifest.icons){
    const mask=path.join(root,'masks/supplement',row.id.toLowerCase()+'.png');assert.equal(hash(fs.readFileSync(mask)),row.mask_sha256);
    const {width,height,pixels}=maskPng(mask);assert.deepEqual([width,height],row.size);
    const [left,top,right,bottom]=row.alpha_bbox;assert.ok(Math.min(left,top,width-right,height-bottom)>=8);
    let visible=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const alpha=pixels[y*width+x];if(x<8||y<8||x>=width-8||y>=height-8)assert.equal(alpha,0);
      if(alpha)visible++;
    }
    assert.ok(visible>=row.preserved_opaque_pixels);
    const webp=fs.readFileSync(path.join(root,'supplement',row.id.toLowerCase()+'.webp'));
    assert.equal(webp.toString('ascii',8,12),'WEBP');assert.ok(webp.includes(Buffer.from('VP8L')));
  }
});
