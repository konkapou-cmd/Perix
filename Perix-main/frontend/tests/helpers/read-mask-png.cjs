const fs=require('node:fs'),zlib=require('node:zlib'),assert=require('node:assert/strict');
module.exports=function maskPng(file){
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
};
