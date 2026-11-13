const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function load(file,deps={},globals={}){const out={};vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports:out,require:name=>{assert.ok(name in deps,`unexpected dependency ${name}`);return deps[name];},...globals});return out;}
const metrics=load('lib/city/mapLayout.ts'),tabLayout=load('lib/navigation/tabLayout.ts');
const React={createElement:(type,props,...children)=>({type,props:{...props,children}})};
const rn={View:'View',Image:'Image',Text:'Text',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator',
  StyleSheet:{create:x=>x,hairlineWidth:1},Platform:{OS:'ios'}};
const face=load('components/navigation/TabArtworkButton.tsx',{react:{default:React},'react-native':rn,
  '../../lib/navigation/tabLayout':tabLayout}).default;
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];

test('category art fills a large button on narrow phones, tablets and desktop without overflowing its grid cell',()=>{
  for(const width of [240,280,320,360,375,414,600,768,900,1280,1920]){
    const m=metrics.categoryButtonMetrics(width),content=Math.min(width,1280)-32;
    assert.ok(m.columns>=2&&m.columns<=8);assert.ok(m.faceSize>=64&&m.faceSize<=120);
    assert.ok(m.faceSize<=content/m.columns-12);assert.equal(m.iconSize,m.faceSize-8);
    assert.ok(m.iconSize>=80);assert.ok(m.iconSize/m.faceSize>.9);
  }
  assert.equal(metrics.categoryButtonMetrics(375).columns,2);
  assert.equal(metrics.categoryButtonMetrics(375).iconSize,112);
  assert.deepEqual(metrics.categoryButtonMetrics(NaN),metrics.categoryButtonMetrics(375));
});

test('tab artwork stays borderless, with zoom/shadow only on the active icon and an unchanged 48px touch frame',()=>{
  for(const focused of [false,true]){
    const source={uri:'existing-local-artwork'},tree=face({source,focused,children:'badge'});
    assert.equal(tree.props.style.width,48);assert.equal(tree.props.style.height,48);
    assert.equal(tree.props.style.backgroundColor,'transparent');
    assert.equal(tree.props.style.borderWidth,undefined);assert.equal(tree.props.style.shadowOpacity,undefined);
    const image=nodes(tree).find(n=>n.type==='Image');assert.equal(image.props.source,source);
    assert.equal(image.props.style.width,36);assert.equal(image.props.style.height,36);
    assert.equal(image.props.resizeMode,'contain');assert.equal(image.props.accessible,false);
    const visual=nodes(tree).find(n=>n.props.testID==='tab-artwork-visual');
    const style=Object.assign({},...visual.props.style.filter(Boolean));
    assert.equal(style.borderWidth,undefined);assert.equal(style.backgroundColor,undefined);
    assert.equal(style.transform?.[0]?.scale,focused?tabLayout.TAB_BUTTON_FOCUSED_SCALE:undefined);
    assert.equal(style.shadowOpacity,focused ? .3 : undefined);
    assert.ok(nodes(tree).find(n=>n.type==='View').props.children.includes('badge'));
  }
});
test('active web artwork uses an alpha drop shadow, not another framed button',()=>{
  const webFace=load('components/navigation/TabArtworkButton.tsx',{react:{default:React},
    'react-native':{...rn,Platform:{OS:'web'}},'../../lib/navigation/tabLayout':tabLayout}).default;
  for(const focused of [false,true]){
    const tree=webFace({source:'local-art',focused});
    const art=nodes(tree).find(n=>n.props.testID==='tab-artwork-visual');
    const style=Object.assign({},...art.props.style.filter(Boolean));
    assert.equal(style.filter,focused?'drop-shadow(0px 4px 5px rgba(22,60,87,0.3))':undefined);
    assert.equal(style.borderColor,undefined);assert.equal(style.elevation,undefined);
  }
  assert.ok(tabLayout.TAB_BUTTON_ICON_SIZE*tabLayout.TAB_BUTTON_FOCUSED_SCALE<tabLayout.TAB_BUTTON_FACE_SIZE);
});

function tabsHost({business=false,token=null,desktop=false,bottom=34,platform='ios'}={}){
  const calls=[],Tabs=Object.assign(function Tabs(){},{Screen:'Screen'});
  const component=load('app/(tabs)/_layout.tsx',{
    'expo-router':{Tabs,Redirect:'Redirect',useSegments:()=>['(tabs)','locator'],
      useRouter:()=>({push:path=>calls.push(['push',path]),navigate:path=>calls.push(['navigate',path])})},
    '@expo/vector-icons':{Ionicons:'Ionicons'},'react-native':{...rn,Platform:{OS:platform,select:values=>values[platform] ?? values.default}},
    '../../context/BadgeContext':{useBadge:()=>({totalBadgeCount:12})},
    '../../hooks/useResponsiveLayout':{useResponsiveLayout:()=>({isDesktop:desktop})},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom})},
    '../../lib/designTokens':{COLORS:{background:'#fff',border:'#ddd',error:'#f00'}},
    '../../context/AuthContext':{useAuth:()=>({activeIdentity:business?{type:'business'}:null,sessionToken:token,user:token?{}:null,loading:false})},
    '../../context/CreateFlowContext':{useCreateFlow:()=>({openCreateSheet:()=>calls.push(['create']),openBizActions:()=>calls.push(['business-actions'])})},
    '../../lib/illustrationSources.generated':{TAB_BAR_ILLUSTRATIONS:{home_tab:'home',locator_tab:'locator',profile_tab:'profile',chat_tab:'chat',create_tab:'create'}},
    '../../lib/city/mapLayout':metrics,'../../components/navigation/TabArtworkButton':{default:face},
    '../../lib/navigation/tabLayout':tabLayout,
    '../../components/navigation/AppBottomNavigation':{default:'Footer'},
  },{React});
  const tree=component.default(),all=nodes(tree),tabs=all.find(node=>node.type===Tabs);
  return {tree,calls,options:tabs?.props.screenOptions,screen:name=>all.find(node=>node.type==='Screen'&&node.props.name===name).props};
}

test('larger tab buttons preserve guest login gates and business/user create actions',()=>{
  const guest=tabsHost();
  assert.equal(guest.tree.type,'Redirect');assert.equal(guest.tree.props.href,'/login');
  const member=tabsHost({token:'test-session'});
  member.screen('create').options.tabBarButton({}).props.onPress();assert.deepEqual(member.calls,[['create']]);
  assert.equal(member.screen('jobs').options.tabBarItemStyle.display,'none');
  const business=tabsHost({business:true,token:'test-session'});
  business.screen('jobs').options.tabBarButton({}).props.onPress();assert.deepEqual(business.calls,[['business-actions']]);
  assert.equal(business.screen('create').options.tabBarItemStyle.display,'none');
});

test('lower footer line preserves the home indicator and unread badge is not enlarged with the selected art',()=>{
  const tabs=tabsHost({bottom:34,token:'session'});assert.equal(tabs.options.tabBarStyle.height,92);
  assert.equal(tabs.options.tabBarStyle.paddingBottom,36);assert.equal(tabs.options.tabBarIconStyle.width,48);
  assert.equal(tabs.options.tabBarStyle.paddingTop,2);assert.equal(tabs.options.tabBarItemStyle.minHeight,52);
  const icon=tabs.screen('messages').options.tabBarIcon({color:'#59abe3',size:24,focused:true});
  const button=icon.type(icon.props),rendered=face(button.props);
  assert.equal(nodes(rendered).find(node=>node.type==='Image').props.source,'chat');
  assert.equal(nodes(rendered).find(node=>node.type==='Text').props.children[0],12);
  assert.equal(tabsHost({desktop:true,platform:'web',token:'session'}).options.tabBarStyle.display,'none');
});

test('compact borderless footer reserves its height instead of covering content and keeps safe-area/auth wiring',()=>{
  const source=read('app/(tabs)/_layout.tsx');
  assert.equal(tabLayout.TAB_BAR_CONTENT_HEIGHT,58);
  assert.match(source,/height: TAB_BAR_CONTENT_HEIGHT \+ insets\.bottom/);
  assert.match(source,/paddingBottom: insets\.bottom\+2/);
  const bar=source.slice(source.indexOf('tabBarStyle:'),source.indexOf('tabBarBackground:'));
  assert.doesNotMatch(bar,/position: "absolute"/);
  assert.match(source,/minHeight:52/);assert.match(source,/totalBadgeCount > 99 \? "99\+" : totalBadgeCount/);
  for(const route of ['home','locator','profile','messages','jobs','create'])assert.ok(source.includes(`name="${route}"`));
  assert.match(source,/requireLogin\(openCreateSheet\)/);assert.match(source,/requireLogin\(openBizActions\)/);
  assert.match(source,/requireLogin\(\(\) => router\.navigate\("\/\(tabs\)\/messages"/);
  assert.doesNotMatch(read('app/(tabs)/home.tsx'),/paddingBottom: 52 \+ insets\.bottom/);
});
test('lower bar keeps the full safe-area reserve at common phone inset sizes',()=>{
  for(const bottom of [0,16,24,34,48]){
    const bar=tabsHost({bottom,token:'session'}).options.tabBarStyle;
    assert.equal(bar.height,58+bottom);assert.equal(bar.paddingBottom,bottom+2);
    assert.ok(bar.height-bar.paddingTop-bar.paddingBottom>=52);
    assert.equal(bar.borderTopWidth,1,'the separator remains; only its vertical position changes');
  }
});
