const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.join(__dirname,'../assets/landmarks');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'sources/labelled-mask-manifest.json'),'utf8'));
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function maskPng(file){
  const png=fs.readFileSync(file),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  assert.equal(png[24],8);assert.equal(png[25],0);assert.equal(png[28],0);
  const chunks=[];
  for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset);
    if(png.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(png.subarray(offset+8,offset+8+length));
    offset+=length+12;}
  const raw=zlib.inflateSync(Buffer.concat(chunks)),pixels=Buffer.alloc(width*height);let cursor=0;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){
    const filter=raw[cursor++];assert.ok(filter<=4);
    for(let x=0;x<width;x++){
      const i=y*width+x,a=x?pixels[i-1]:0,b=y?pixels[i-width]:0,c=x&&y?pixels[i-width-1]:0;
      pixels[i]=(raw[cursor++]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;
    }
  }
  return {width,height,pixels};
}
test('all 70 legacy IDs retain audited lossless images and an unchanged source atlas',()=>{
  assert.equal(manifest.icons.length,70);assert.equal(manifest.core_alpha_threshold,128);
  assert.equal(hash(fs.readFileSync(path.join(root,'sources',manifest.source_file))),manifest.source_sha256);
  for(const [index,row] of manifest.icons.entries()){
    assert.equal(row.id,`legacy-${String(index+1).padStart(3,'0')}`);
    const image=fs.readFileSync(path.join(root,'original-70',row.id+'.webp'));
    assert.equal(hash(image),row.sha256);assert.equal(image.toString('ascii',8,12),'WEBP');
    let lossless=false;
    for(let offset=12;offset<image.length;){
      const length=image.readUInt32LE(offset+4);
      if(image.toString('ascii',offset,offset+4)==='VP8L'){
        lossless=true;assert.equal(image[offset+8],0x2f);
        const bits=image.readUInt32LE(offset+9);
        assert.deepEqual([(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1],row.size);
      }
      offset+=8+length+(length%2);
    }
    assert.equal(lossless,true);assert.equal(row.preserved_component_pixels,row.original_component_pixels);
    assert.ok(row.preserved_component_pixels>7000);
  }
});
test('every illustration has a real alpha mask and 8px safe padding, not a clipped grid rectangle',()=>{
  assert.equal(manifest.padding,8);
  for(const row of manifest.icons){
    const file=path.join(root,'masks/original-70',row.id+'.png');
    assert.equal(hash(fs.readFileSync(file)),row.mask_sha256);
    const {width,height,pixels}=maskPng(file);assert.deepEqual([width,height],row.size);
    const [left,top,right,bottom]=row.alpha_bbox;
    assert.ok(Math.min(left,top,width-right,height-bottom)>=8);
    let count=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const alpha=pixels[y*width+x];
      if(x<8||y<8||x>=width-8||y>=height-8)assert.equal(alpha,0,row.id+' border');
      if(alpha)count++;
    }
    assert.ok(count>=row.preserved_component_pixels);
  }
});
test('source-edge limitations are recorded rather than inventing missing artwork',()=>{
  assert.deepEqual(manifest.icons.filter(row=>row.source_boundary_touch).map(row=>row.id),['legacy-003','legacy-004','legacy-036']);
});
