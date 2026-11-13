const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
function rgba(file){
  const png=fs.readFileSync(path.join(__dirname,'../assets/brand',file));
  assert.equal(png.readUInt32BE(0),0x89504e47);
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  assert.equal(png[24],8);assert.equal(png[25],6);assert.equal(png[28],0);
  const chunks=[];
  for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset);
    if(png.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(png.subarray(offset+8,offset+8+length));
    offset+=length+12;}
  const raw=zlib.inflateSync(Buffer.concat(chunks)),stride=width*4,data=Buffer.alloc(stride*height);
  let index=0;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){
    const filter=raw[index++];assert.ok(filter<=4);
    for(let x=0;x<stride;x++){
      const i=y*stride+x,a=x>=4?data[i-4]:0,b=y?data[i-stride]:0,c=y&&x>=4?data[i-stride-4]:0;
      data[i]=(raw[index++]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;
    }
  }
  return {width,height,data};
}
test('destination compass has a transparent exterior without recolouring or redrawing the original',()=>{
  const source=rgba('perix-compass.png'),map=rgba('perix-compass-transparent.png');
  assert.equal(map.width,source.width);assert.equal(map.height,source.height);
  const at=(x,y)=>(y*map.width+x)*4;
  for(const [x,y] of [[0,0],[167,0],[0,167],[167,167]])assert.equal(map.data[at(x,y)+3],0);
  let removed=0,preserved=0;
  for(let i=0;i<map.data.length;i+=4){
    assert.deepEqual(map.data.subarray(i,i+3),source.data.subarray(i,i+3),'original RGB pixels are unchanged');
    if(map.data[i+3]===0)removed++;else{assert.equal(map.data[i+3],source.data[i+3]);preserved++;}
  }
  assert.ok(removed>15000);assert.ok(preserved>8000);
  assert.equal(map.data[at(84,84)+3],255,'compass centre remains solid');
});
