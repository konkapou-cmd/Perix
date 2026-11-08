const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const out={};vm.runInNewContext(ts.transpileModule(read('lib/city/mapPresentation.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});
const {transitStopAppearance,mapEntityPinSize,profileInitial,createUserPinElement}=out;

test('overview stops are dots, then grow into icons, platform codes and names at close zoom',()=>{
  assert.equal(transitStopAppearance(10).size,4);assert.equal(transitStopAppearance(12).size,6);assert.equal(transitStopAppearance(14).size,8);
  assert.equal(transitStopAppearance(14).dot,true);assert.equal(transitStopAppearance(14).platforms,false);
  assert.equal(transitStopAppearance(15).dot,false);assert.equal(transitStopAppearance(15).platforms,false);
  assert.equal(transitStopAppearance(16).platforms,true);assert.equal(transitStopAppearance(16).names,false);
  assert.equal(transitStopAppearance(17).names,true);
  const sizes=[10,12,14,15,16,17].map(z=>transitStopAppearance(z).size);
  assert.ok(sizes.every((size,index)=>!index || size>sizes[index-1]));
});
test('stop appearance is stable inside a zoom bucket and contains no physical network filtering',()=>{
  assert.deepEqual(transitStopAppearance(12),transitStopAppearance(13.9));
  const web=read('components/BusinessMap.web.tsx'),native=read('components/BusinessMap.native.tsx');
  assert.match(web,/transitStopAppearance\(zoom\)/);assert.match(native,/transitStopAppearance\(zoomLevel\)/);
  assert.match(web,/container\.dataset\.platformId/);assert.match(native,/onTransitStopPress\?\.\(stop\)/);
  assert.match(web,/codes\.textContent=Array\.from\(new Set\(platformCodes\)\)\.join\(" · "\)/);
  assert.match(native,/stopPlatformCodes/);
  assert.doesNotMatch(web,/b\.textContent = r\.route_number/);
  assert.doesNotMatch(native,/\{r\.route_number\}/);
  assert.doesNotMatch(native,/zoomLevel >= 12 &&\s*transitStops/);
  assert.match(web,/if \(!overlayProjection\) return;/);
});
test('directory pins use round entity images and grow with zoom without becoming oversized',()=>{
  const sizes=[8,10,12,14,16,18,20,24].map(mapEntityPinSize);
  assert.ok(sizes[0]>=24&&sizes.at(-1)<=44);
  assert.ok(sizes.every((value,index)=>!index||value>=sizes[index-1]));
  assert.ok(sizes[3]>sizes[0]&&sizes[5]>sizes[3]);
  const gateway=read('components/city/CityGatewayScreen.tsx');
  assert.match(gateway,/pinImage: markerProfileImage\(r\)/);
  for(const file of ['components/BusinessMap.native.tsx','components/BusinessMap.web.tsx']){
    const source=read(file);assert.match(source,/pinImage/);assert.match(source,/mapEntityPinSize/);
  }
  assert.match(read('components/BusinessMap.native.tsx'),/DirectoryPinArt source=\{item\.pinImage!/);
  assert.match(read('components/BusinessMap.web.tsx'),/avatar\.style\.objectFit="cover"/);
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
  for(const file of ['components/city/CityGatewayScreen.tsx','app/(tabs)/home.tsx','app/(tabs)/locator.tsx']){
    const source=read(file);assert.match(source,/userPinImage=\{user\?\.profile_photo \|\| user\?\.picture \|\| undefined\}/);
    assert.match(source,/userPinName=\{user\?\.name\}/);
  }
  const locator=read('app/(tabs)/locator.tsx');assert.match(locator,/pinLocation=\{livePosition\}/);
  assert.doesNotMatch(locator,/pinLocation=\{locateFocus/);
  const native=read('components/BusinessMap.native.tsx');assert.match(native,/onError=\{\(\)=>setPinImageFailed\(true\)\}/);
  assert.match(native,/profileInitial\(userPinName\)/);
});
