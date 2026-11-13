const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const file=path.join(__dirname,'../scripts/ui-artwork-v2-plan.json'),bytes=fs.readFileSync(file),plan=JSON.parse(bytes);
test('the exact user-selected v2 baseline is pinned, not a later aggressive mask experiment',()=>{
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'4ea6e29ad530d98a20b9f1204cd2c6eb5f8005f6ffa995adbb8f860488061897');
  assert.equal(plan.profile,'user-selected-full-contours-v2');assert.equal(plan.core_alpha_threshold,160);
  assert.equal(plan.icons.length,259);assert.equal(new Set(plan.icons.map(row=>row.target)).size,259);
  assert.match(plan.status,/some captions remain/i);
});
test('all selected contours retain padding, component membership and image/mask hashes',()=>{
  const counts={};
  for(const row of plan.icons){
    counts[row.sheet]=(counts[row.sheet]||0)+1;
    assert.ok(row.components.length);assert.ok(row.preserved_core_pixels>=350);
    assert.match(row.sha256,/^[a-f0-9]{64}$/);assert.match(row.mask_sha256,/^[a-f0-9]{64}$/);
    const [left,top,right,bottom]=row.alpha_bbox,[width,height]=row.size;
    assert.ok(Math.min(left,top,width-right,height-bottom)>=8);
    assert.equal(row.target.includes('..'),false);
  }
  assert.deepEqual(counts,{app:37,market1:71,market2:69,market3:47,services:35});
});
test('the reproduction tool verifies exact v2 bytes and cannot auto-install candidate images',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../scripts/extract-ui-artwork.py'),'utf8');
  assert.match(source,/sha\(target\)==row\['sha256'\]/);
  assert.match(source,/sha\(mask\)==row\['mask_sha256'\]/);
  assert.match(source,/box==row\['source_box'\]/);
  assert.match(source,/exist_ok=False/);
  assert.doesNotMatch(source,/shutil\.copy|rmtree|assets\/illustrations/);
});
