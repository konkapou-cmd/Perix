const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,dependencies={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText,{exports,require:n=>dependencies[n],console});return exports;}
const controls=load('lib/city/flightControls.ts');
test('joystick normalization has a center deadzone, vertical-only throttle and bounded diagonals',()=>{
  const box={left:0,top:0,width:128,height:128};
  assert.equal(controls.flightJoystickAxes(64,64,box).y,0);
  assert.equal(controls.flightJoystickAxes(65,65,box).x,0);
  const throttle=controls.flightJoystickAxes(400,0,box,true);
  assert.equal(throttle.x,0);assert.equal(throttle.y,1);
  const diagonal=controls.flightJoystickAxes(1000,-1000,box);
  assert.ok(diagonal.x>0&&diagonal.y>0);
  assert.ok(Math.hypot(diagonal.x,diagonal.y)<=1+1e-12);
  assert.equal(controls.flightJoystickAxes(NaN,0,box).x,0);
});
function stick(vertical=false){
  const effects=[],values=[];
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:fn=>effects.push(fn)};
  const Joystick=load('components/game/FlightJoystick.jsx',{react:{...react,default:react},'../../lib/city/flightControls':controls}).default;
  const tree=Joystick({id:'test',label:'test',vertical,resetToken:0,onChange:value=>values.push({...value})});
  const base=tree.props.children[1],captured=new Set();
  const element={getBoundingClientRect:()=>({left:0,top:0,width:128,height:128}),
    setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)};
  base.props.ref.current=element;effects[0]();const cleanup=effects[1]();
  const event=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,currentTarget:element,preventDefault(){}});
  return {base,values,event,captured,reset:effects[0],cleanup};
}
test('two full-axis thumb pointers operate independently, cannot steal a stick, and release cleanly',()=>{
  const left=stick(),right=stick();
  left.base.props.onPointerDown(left.event(11,64,0));
  assert.equal(left.values.at(-1).y,1);
  left.base.props.onPointerMove(left.event(11,95,25));
  assert.ok(left.values.at(-1).x>0&&left.values.at(-1).y>0,'left WASD stick supports diagonal throttle and turn');
  const held=left.values.at(-1).y;
  const count=left.values.length;
  left.base.props.onPointerDown(left.event(22,64,128));
  assert.equal(left.values.length,count,'second pointer cannot steal the throttle');
  right.base.props.onPointerDown(right.event(22,110,30));
  assert.ok(right.values.at(-1).x>0&&right.values.at(-1).y>0);
  right.base.props.onPointerUp(right.event(22,110,30));
  assert.equal(right.values.at(-1).x,0);assert.equal(right.values.at(-1).y,0);
  assert.equal(left.values.at(-1).y,held,'releasing right does not reset left');
  left.base.props.onPointerCancel(left.event(11,64,0));
  assert.equal(left.values.at(-1).y,0);assert.equal(left.captured.size,0);
  left.cleanup();right.cleanup();
});
test('pause/reset, lost capture and teardown cannot leave a held axis behind',()=>{
  const joystick=stick();
  joystick.base.props.onPointerDown(joystick.event(1,128,64));
  joystick.reset();assert.equal(joystick.values.at(-1).x,0);assert.equal(joystick.captured.size,0);
  joystick.base.props.onPointerDown(joystick.event(2,128,64));
  joystick.base.props.onLostPointerCapture(joystick.event(2,128,64));
  assert.equal(joystick.values.at(-1).x,0);
  joystick.base.props.onPointerDown(joystick.event(3,128,64));
  joystick.cleanup();assert.equal(joystick.values.at(-1).x,0);assert.equal(joystick.captured.size,0);
});
