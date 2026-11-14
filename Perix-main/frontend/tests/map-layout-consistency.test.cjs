const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(read(file),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{exports,require:name=>deps[name]});return exports;}
const layout=load('lib/city/mapLayout.ts');
const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useMemo:fn=>fn(),useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useEffect:()=>{}};
let viewportWidth=1280;
const rn={View:'View',Text:'Text',Image:'Image',Pressable:'Button',Platform:{OS:'web'},StyleSheet:{create:value=>value},useWindowDimensions:()=>({width:viewportWidth,height:800})};
function nodes(tree){if(!tree || typeof tree!=='object')return[];if(Array.isArray(tree))return tree.flatMap(nodes);return[tree,...nodes(tree.props?.children)];}
const style=value=>Object.assign({},...(Array.isArray(value)?value.flat(Infinity).filter(Boolean):[value]));

test('the /app camera opens at a station-scale viewport around the 150 m search radius',()=>{
  for(const [width,height,latitude] of [[343,257,52.14],[868,449,52.14],[288,216,52.14]]){
    const zoom=layout.initialNearbyMapZoom(width,height,latitude,300,850,18);
    const metersPerPixel=40075016.686/(256*2**zoom)*Math.cos(latitude*Math.PI/180);
    const shortSpan=Math.min(width,height)*metersPerPixel,longSpan=Math.max(width,height)*metersPerPixel;
    assert.ok(shortSpan>=300&&longSpan<=850&&zoom<=18);
  }
});

test('ultrawide station view stays bounded while leaving room for a 150 m boarding stop',()=>{
  const width=968,height=341,latitude=52.1304;
  const zoom=layout.initialNearbyMapZoom(width,height,latitude,300,850,18);
  const metersPerPixel=40075016.686/(256*2**zoom)*Math.cos(latitude*Math.PI/180);
  const shortSpan=Math.min(width,height)*metersPerPixel,longSpan=Math.max(width,height)*metersPerPixel;
  assert.ok(longSpan<=851&&longSpan>=840);
  assert.ok(shortSpan>=299&&shortSpan<400);
});

test('desktop keeps fixed App/Members slots and mobile removes all top navigation links',()=>{
  let pathname='/app',user=null,label='Members';
  const Header=load('components/city/MapScreenHeader.tsx',{react:{default:React},'react-native':rn,
    'expo-router':{usePathname:()=>pathname,useRouter:()=>({navigate(){}})},
    'react-i18next':{useTranslation:()=>({t:(key,fallback)=>key==='nav.members'?label:fallback})},
    '../../context/AuthContext':{useAuth:()=>({user,loading:false})},'../brand/PerixLogo':{default:'Logo'},'./MapBaseSelector':{default:'Base'},
    '../../lib/city/mapLayout':layout,
    './FontMagnifierButton':{default:'Magnifier'},
    '@expo/vector-icons':{Ionicons:'Icon'},
  }).default;
  const geometry=[];
  for(const [route,publicScreen,name] of [['/app',true,'Members'],['/home',false,'Μέλη']]){
    pathname=route;label=name;user=publicScreen?null:{name:'Alex'};
    const tree=Header({publicScreen}),all=nodes(tree),app=style(all.find(n=>n.props.testID==='map-nav-app').props.style),members=style(all.find(n=>n.props.testID==='map-nav-members').props.style);
    const primary=all.find(n=>n.props.testID==='map-primary-navigation'),gap=style(primary.props.style).gap;
    assert.deepEqual(nodes(primary).filter(n=>n.type==='Button').map(n=>n.props.testID),['map-nav-app','map-nav-members']);
    assert.equal(style(tree.props.style).maxWidth,layout.MAP_PAGE_MAX_WIDTH);
    assert.equal(style(tree.props.children[0].props.style).height,56);
    const start=(Math.min(viewportWidth,layout.MAP_PAGE_MAX_WIDTH)-app.width-members.width-gap)/2;
    geometry.push({appX:start,membersX:start+app.width+gap,appWidth:app.width,membersWidth:members.width,height:members.height});
  }
  assert.deepEqual(geometry[0],geometry[1]);
  assert.equal(geometry[0].membersX,623);assert.equal(geometry[0].membersWidth,104);assert.equal(geometry[0].height,44);
  pathname='/locator';
  const locator=Header({exploreOnly:true}),all=nodes(locator),nav=all.find(n=>n.props.testID==='map-primary-navigation');
  assert.equal(all.find(n=>n.props.testID==='map-nav-explore'),undefined);
  assert.deepEqual(nodes(nav).filter(n=>n.type==='Button').map(n=>n.props.testID),['map-nav-app','map-nav-members']);
  const savedWidth=viewportWidth;
  for(const width of [320,375,768,1023]){
    viewportWidth=width;
    assert.equal(nodes(Header({})).find(n=>n.props.testID==='map-screen-navigation'),undefined);
  }
  viewportWidth=savedWidth;
});

test('one desktop frame and 16px gutter define equal map/card/header edges even on narrow screens',()=>{
  for(const width of [320,375,899,1280,1440,1920]){
    const frame=Math.min(width,layout.MAP_PAGE_MAX_WIDTH),left=(width-frame)/2+layout.MAP_PAGE_GUTTER;
    const content=frame-2*layout.MAP_PAGE_GUTTER;
    assert.equal(left+content,width-left);assert.ok(content>0);
  }
  const app=read('components/city/CityGatewayScreen.tsx'),tabs=read('app/(tabs)/_layout.tsx'),header=read('components/city/MapScreenHeader.tsx');
  assert.match(app,/padding: MAP_PAGE_GUTTER/);assert.match(app,/maxWidth: MAP_PAGE_MAX_WIDTH/);
  assert.match(header,/maxWidth:MAP_PAGE_MAX_WIDTH/);assert.match(header,/paddingHorizontal:MAP_PAGE_GUTTER/);
  assert.match(tabs,/maxWidth: MAP_PAGE_MAX_WIDTH/);assert.match(tabs,/paddingHorizontal: 0/);
});

test('map callers remove renderer insets so they cannot double the card gutter on web or native',()=>{
  for(const file of ['components/city/CityGatewayScreen.tsx','components/home/MapSection.tsx','components/locator/LegacyLocatorScreen.tsx'])assert.match(read(file),/horizontalInset=\{0\}/);
  assert.match(read('components/BusinessMap.web.tsx'),/marginHorizontal:horizontalInset/);
  assert.match(read('components/BusinessMap.native.tsx'),/marginHorizontal:horizontalInset/);
  assert.match(read('components/city/CityGatewayScreen.tsx'),/mapBorder: \{[^}]*left: 0, right: 0/);
  assert.match(read('components/mobility/NearbyTransitSection.tsx'),/paddingHorizontal:0/);
  assert.match(read('app/(tabs)/home.tsx'),/mapContentGutter:\{marginHorizontal:MAP_PAGE_GUTTER\}/);
  assert.match(read('components/home/CarouselSection.tsx'),/marginHorizontal: MAP_PAGE_GUTTER/);
  assert.match(read('components/home/CarouselSection.tsx'),/paddingHorizontal: 0/);
});

test('Home map gets the same outside gutter while the shared renderer receives no extra horizontal inset',()=>{
  const MapSection=load('components/home/MapSection.tsx',{react:{...React,default:React},'react-native':rn,
    'expo-router':{useRouter:()=>({})},'react-i18next':{useTranslation:()=>({t:(key,fallback)=>fallback})},'@expo/vector-icons':{Ionicons:'Icon'},
    '../../components/BusinessMap':{default:'Map'},'../locator/LocatorCard':{default:'Card'},
    '../../lib/designTokens':{COLORS:{},FONT_SIZES:{bodySmall:15,small:13},FONT_WEIGHTS:{semibold:'600'}},'../../lib/navigation/entityRoutes':{},'../../lib/city/mapLayout':layout,
  }).MapSection;
  const tree=MapSection({mapBounds:{minLat:52,maxLat:53,minLng:11,maxLng:12,centerLat:52.5,centerLng:11.5},businesses:[],events:[],activities:[],rentals:[],jobs:[],services:[],onRegionChange(){}});
  assert.equal(style(tree.props.style).marginHorizontal,16);assert.equal(nodes(tree).find(n=>n.type==='Map').props.horizontalInset,0);
});

test('white background includes the page behind /app cards and the desktop margins, not just card faces',()=>{
  assert.equal(layout.MAP_PAGE_BACKGROUND,'#fff');
  const app=read('components/city/CityGatewayScreen.tsx'),chrome=read('components/GlobalWebChrome.tsx'),tabs=read('app/(tabs)/_layout.tsx');
  assert.match(app,/lower: \{[^}]*backgroundColor:MAP_PAGE_BACKGROUND/);
  assert.match(app,/content: \{[^}]*backgroundColor:MAP_PAGE_BACKGROUND/);
  assert.ok((chrome.match(/backgroundColor:MAP_PAGE_BACKGROUND/g)||[]).length>=2);
  assert.match(tabs,/backgroundColor: MAP_PAGE_BACKGROUND/);
  const {COLORS}=load('lib/designTokens.ts');assert.equal(COLORS.background.toUpperCase(),'#FFFFFF');
});

test('mobile safe-area and hidden visual scrollbars keep the brand and horizontal bounds consistent',()=>{
  const app=read('components/city/CityGatewayScreen.tsx'),home=read('app/(tabs)/home.tsx'),locator=read('components/locator/LegacyLocatorScreen.tsx');
  assert.match(app,/<SafeAreaView style=\{styles.page\} edges=\{\['top'\]\}/);
  for(const source of [app,home,locator])assert.match(source,/showsVerticalScrollIndicator=\{false\}/);
  assert.match(app,/searchBar: \{[^}]*marginHorizontal: 0/);
  assert.match(locator,/searchBarSection: \{\s*paddingHorizontal: MAP_PAGE_GUTTER/);
});

test('compact header reserves enough space for the logo and centers the primary group on phone widths',()=>{
  for(const width of [320,375,430,600,768,1280]){
    const metrics=layout.mapHeaderMetrics(width),frame=Math.min(width,layout.MAP_PAGE_MAX_WIDTH);
    const side=(frame-2*layout.MAP_PAGE_GUTTER-metrics.primaryWidth)/2;
    assert.ok(side>=metrics.logoWidth,`${width}px logo budget`);
    assert.equal((layout.MAP_PAGE_GUTTER+side)+metrics.primaryWidth/2,frame/2);
    assert.ok(metrics.appWidth>=44);assert.ok(metrics.membersWidth>=44);
  }
});

test('primary navigation is a child of the brand row, not a second row below Perix',()=>{
  const source=read('components/city/MapScreenHeader.tsx');
  assert.match(source,/testID="map-header-brand-slot"/);assert.match(source,/testID="map-header-actions-slot"/);
  assert.match(source,/side:\{flex:1,minWidth:0/);
  assert.match(source,/map-screen-navigation" style=\{\{width:metrics.primaryWidth,flexShrink:0\}\}/);
  assert.doesNotMatch(source,/<MapBaseSelector/);
  assert.match(source,/activeText:\{color:'#59ABE3'\}/);
  assert.match(source,/text:\{fontSize:14,fontWeight:'600',color:'#064472'\}/);
  assert.match(source,/backgroundColor:'transparent'/);
});

test('long user/area names are constrained and cannot force the Home header beyond its parent',()=>{
  const controls=read('components/home/HomeHeaderControls.tsx'),identity=read('components/profile/IdentityDropdown.tsx');
  assert.match(controls,/locationText:\{flex:1,minWidth:0,flexShrink:1/);
  assert.match(controls,/identity:\{flex:1,minWidth:0,maxWidth:'100%'\}/);
  assert.match(identity,/container: \{\s*alignSelf: "stretch",\s*maxWidth:'100%',minWidth:0,flexShrink:1/);
  assert.match(identity,/name: \{\s*flexShrink:1,minWidth:0/);
  assert.match(read('components/city/MapBaseSelector.tsx'),/selectorLabel:\{flex:1,minWidth:0\}/);
});

test('desktop Locator sidebar is positioned over, not in front of the map layout flow',()=>{
  const sidebar=read('components/locator/LocatorSidebar.tsx'),screen=read('components/locator/LegacyLocatorScreen.tsx');
  assert.match(sidebar,/overlayContainer: \{position:"absolute",top:0,bottom:0,left:0,zIndex:110/);
  assert.match(screen,/testID="locator-sidebar-layout" style=\{styles\.sidebarLayout\}/);
  assert.match(screen,/overlay=\{Platform\.OS === "web"\}/);
  assert.match(screen,/sidebarLayout: \{\s*flex: 1,\s*flexDirection: "row",\s*position: "relative",\s*overflow: "hidden"/);
  assert.match(sidebar,/itemActive: \{ backgroundColor: "transparent" \}/);
  assert.match(sidebar,/subItemActive: \{ backgroundColor: "transparent" \}/);
  assert.match(screen,/const \[sidebarOpen, setSidebarOpen\] = useState\(isDesktop\)/);
  assert.match(screen,/testID="locator-category-toggle"/);
  assert.match(screen,/accessibilityLabel=\{sidebarOpen \? t\("locator\.hideCategories"/);
  assert.match(screen,/\{sidebarOpen \? \(/);
  assert.doesNotMatch(screen,/\{isDesktop \|\| sidebarOpen \? \(/);
  assert.match(screen,/onClose=\{!isDesktop \? \(\) => setSidebarOpen\(false\) : undefined\}/);
  assert.match(screen,/onDismiss=\{\(\) => setSidebarOpen\(false\)\}/);
});

test('Home/Locator hide below-map stop lists; App uses an origin-stable 150 m station scope',()=>{
  assert.doesNotMatch(read('app/(tabs)/home.tsx'),/<NearbyTransitSection/);
  assert.doesNotMatch(read('app/(tabs)/locator.tsx'),/locator-nearby-stops-toggle/);
  const app=read('components/city/CityGatewayScreen.tsx');assert.match(app,/testID="city-origin-gate"/);
  assert.match(app,/<NearbyTransitSection collapsible initialExpanded hideWhenEmpty/);
  assert.match(app,/getNearbyMap\(null,queryOrigin,nearbyQueryBounds/);
  assert.match(app,/radiusM:nearbyScopeRadiusM/);assert.match(app,/selectedStopId\?NEARBY_STOP_RADIUS_M:APP_NEARBY_STOP_RADIUS_M/);
  assert.doesNotMatch(app,/nearbyViewportKey/);
  assert.match(app,/getTransitStops\(null\)/);
  assert.doesNotMatch(app,/getV2Map\(null/);
  assert.match(app,/current && <View style=\{styles\.row\}/);
});

test('Gateway category/search cards use white surfaces without the Locator elevation',()=>{
  const app=read('components/city/CityGatewayScreen.tsx'),gatewayCard=read('components/city/GatewayResultCard.tsx');
  assert.match(app,/backgroundColor: "#fff"/);assert.doesNotMatch(app,/styles\.tile[^\n]*SHADOWS/);
  assert.match(gatewayCard,/styles\.flatCard/);assert.match(read('components/locator/LocatorCard.tsx'),/flatCard: \{ shadowOpacity: 0/);
  assert.match(gatewayCard,/backgroundColor:"#fff"/);
});
