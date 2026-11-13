const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports,console,require:name=>{assert.ok(name in deps,`unexpected dependency: ${name}`);return deps[name];}});return exports;}
const model=load('lib/home/discovery.ts',{'../api/core':{ACTIVITY_TYPES:{walk:{category:'movement_outdoor'}}}});
const empty=()=>({businesses:[],hotels:[],events:[],activities:[],jobs:[],services:[],products:[],rentals:[],ownerHomes:[]});
const plain=value=>JSON.parse(JSON.stringify(value));
const filter=()=>model.createDiscoveryFilters().businesses;

test('discovery has exactly the eight ordered sections and independent filter objects',()=>{
  assert.deepEqual(plain(model.DISCOVERY_SECTIONS),['businesses','events','activities','jobs','services','products','rentals','hotels']);
  const filters=model.createDiscoveryFilters();filters.businesses.category='food-dining';assert.equal(filters.jobs.category,'');
  for(const invalid of ['mobility','unknown',undefined,['events']])assert.equal(model.discoverySection(invalid),'businesses');
});
test('business children are conditional and support grouped or flat taxonomy without duplicates',()=>{
  const tree=[{slug:'leaf'},{slug:'food',subcategories:[{slug:'cafe'}],groups:[{subcategories:[{slug:'cafe'},{slug:'pizza'}]}]}];
  assert.equal(model.businessChildren(tree,'').length,0);assert.equal(model.businessChildren(tree,'leaf').length,0);
  assert.deepEqual(plain(model.businessChildren(tree,'food').map(x=>x.slug)),['cafe','pizza']);
});
test('business root/subcategory filters keep multi-subcategory records, without changing feed inputs',()=>{
  const data=empty();data.businesses=[{business_id:'one',name:'Cafe',root_category:'food',subcategory:'pizza',subcategories:['coffee']},{business_id:'two',root_category:'shops'}];
  const before=JSON.stringify(data),f={...filter(),category:'food',subcategory:'coffee'};
  const results=model.discoveryResults(data,'businesses',f);assert.equal(results.length,1);assert.equal(JSON.stringify(data),before);
  const projection=model.projectDiscoveryResults(results);assert.equal(projection.businesses[0],data.businesses[0]);assert.equal(projection.events.length,0);
});
test('event default is next seven days; explicit ranges include the entire final date',()=>{
  const data=empty(),now=new Date('2026-11-10T12:00:00Z');
  data.events=['2026-11-09T12:00:00Z','2026-11-11T12:00:00Z','2026-11-18T12:00:00Z'].map((start_time,i)=>({event_id:String(i),start_time}));
  assert.deepEqual(plain(model.discoveryResults(data,'events',filter(),now).map(x=>x.id)),['1']);
  const explicit={...filter(),startDate:'2026-11-18',endDate:'2026-11-18'};
  assert.deepEqual(plain(model.discoveryResults(data,'events',explicit,now).map(x=>x.id)),['2']);
  assert.equal(model.dateBoundary('2026-11-18',true),'2026-11-18T23:59:59.999');
});
test('activity category resolves existing theme taxonomy and rentals include/deduplicate owner listings',()=>{
  const data=empty();data.activities=[{activity_id:'walk',theme:'walk',date:'2026-11-10'}];
  assert.equal(model.discoveryResults(data,'activities',{...filter(),category:'movement_outdoor'}).length,1);
  data.rentals=[{rental_id:'duplicate',listing_id:'owner',source_type:'owner',subcategory:'apartments'}];
  data.ownerHomes=[{listing_id:'owner',attributes:{property_type:'apartment'}},{listing_id:'other',attributes:{property_type:'room'}}];
  const results=model.discoveryResults(data,'rentals',{...filter(),category:'apartment'});
  assert.equal(results.length,1);assert.equal(results[0].id,'owner');
});
test('typed identities do not collide across sections and service/product/hotel filters work',()=>{
  const data=empty();data.services=[{service_id:'same',business_id:'wrong',name:'Cut',type:'salon_appointment'}];
  data.products=[{listing_id:'same',title:'Bike',category:'bikes_mobility'}];
  data.hotels=[{business_id:'same',name:'Stay',subcategory:'hotels'}];
  assert.equal(model.discoveryResults(data,'services',{...filter(),category:'salon_appointment'})[0].id,'same');
  assert.equal(model.discoveryResults(data,'products',{...filter(),category:'bikes_mobility',query:'BIKE'}).length,1);
  assert.equal(model.discoveryResults(data,'hotels',{...filter(),subcategory:'rooms'}).length,0);
  assert.notEqual(model.discoveryResults(data,'services',filter())[0].key,model.discoveryResults(data,'products',filter())[0].key);
});

function host(){const slots=[],pending=[];let index=0;
  const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},
    useRef(initial){const i=index++;return slots[i]||={current:initial};},
    useMemo(fn,deps){const i=index++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:fn()};return slots[i].value;},
    useEffect(fn,deps){const i=index++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))pending.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
  return {react:{...React,default:React},render(fn,props){index=0;const result=fn(props);pending.splice(0).forEach(fn=>fn());return result;}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('focused search reuses Home arrays, fixes favorite truncation, caches reads and ignores stale responses',async()=>{
  const h=host(),calls=[],pending=[];
  const hook=load('hooks/useHomeDiscovery.ts',{react:h.react,'../lib/home/discovery':model,'../lib/api/listings':{},'../lib/api':{
    getNearbyBusinesses:(...args)=>{calls.push(args);return new Promise(resolve=>pending.push(resolve));},
  }}).useHomeDiscovery;
  const data=empty();data.businesses=[{business_id:'feed',root_category:'food'}];
  let props={token:'session',bounds:{minLat:52,maxLat:53,minLng:11,maxLng:12,centerLat:52.5,centerLng:11.5},data,section:'businesses',filter:filter(),favoriteBusinesses:false,refreshKey:0};
  assert.equal(h.render(hook,props).results[0].id,'feed');assert.equal(calls.length,0);
  props={...props,favoriteBusinesses:true};assert.equal(h.render(hook,props).loading,true);assert.equal(calls.length,1);assert.equal(calls[0][3],undefined);
  props={...props,filter:{...filter(),category:'food'}};h.render(hook,props);assert.equal(calls.length,2);
  pending[1]([{business_id:'new',root_category:'food'}]);await flush();assert.equal(h.render(hook,props).results[0].id,'new');
  pending[0]([{business_id:'stale'}]);await flush();assert.equal(h.render(hook,props).results[0].id,'new');
  props={...props,filter:{...props.filter,query:'new'}};h.render(hook,props);assert.equal(calls.length,2,'typing does not refetch');
  props={...props,filter:{...filter(),category:'shops'}};h.render(hook,props);assert.equal(calls.length,3);
  props={...props,filter:{...filter(),category:'food'}};h.render(hook,props);assert.equal(calls.length,3,'returning to a filter reuses cache');
  assert.equal(h.render(hook,props).results[0].id,'new');
});
test('failed search has no misleading old results and retry is focused',async()=>{
  const h=host();let calls=0;
  const hook=load('hooks/useHomeDiscovery.ts',{react:h.react,'../lib/home/discovery':model,'../lib/api/listings':{},'../lib/api':{getNearbyBusinesses:async()=>{calls++;throw Error('offline');}}}).useHomeDiscovery;
  const props={token:'session',bounds:{centerLat:52,centerLng:11},data:empty(),section:'businesses',filter:filter(),favoriteBusinesses:true,refreshKey:0};
  h.render(hook,props);await flush();let result=h.render(hook,props);assert.equal(result.error,true);assert.equal(result.results.length,0);
  result.retry();h.render(hook,props);assert.equal(calls,2);
});
function nodes(tree){return !tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];}
test('business UI has category then conditional subcategory, while other sections retain their own filters',async()=>{
  const h=host();let props;
  const Panel=load('components/home/HomeDiscoveryPanel.tsx',{
    react:h.react,'react-native':{ActivityIndicator:'Loading',Image:'Image',Pressable:'Button',ScrollView:'Scroll',Text:'Text',TextInput:'Input',View:'View',StyleSheet:{create:x=>x}},
    'expo-router':{useRouter:()=>({})},'react-i18next':{useTranslation:()=>({t:(k,f)=>f})},
    '../../lib/api':{ACTIVITY_TYPES:{},EVENT_THEMES:{arts:{label:'Arts'}},getCategoryTree:async()=>[
      {slug:'food',subcategories:[{slug:'cafe'}]},{slug:'leaf',subcategories:[]},
    ]},'../../lib/config/serviceModules':{SERVICE_MODULES:{}},'../../lib/marketplace/marketplaceTaxonomy':{MARKETPLACE_CATEGORIES:[]},
    '../../lib/home/discovery':model,'../../lib/designTokens':{COLORS:{},LOCATOR_FONT_FAMILY:{regular:'r',semibold:'s',bold:'b'}},'../../lib/categoryTranslation':{translateCategory:key=>key},
    '../../lib/navigation/entityRoutes':{},'../icons/IllustratedIcon':{illustratedIconSource:()=>undefined},
    '../navigation/ProgressivePicker':{default:'Picker'},'../shared/DatePickerModal':{default:'Dates'},'../locator/LocatorCard':{default:'Card'},
  }).default;
  props={token:'session',section:'businesses',filter:filter(),results:[],loading:false,error:false,onRetry(){},onSection(){},onFilter:value=>props={...props,filter:value}};
  const pickers=()=>nodes(h.render(Panel,props)).filter(n=>n.type==='Picker');
  pickers();await flush();let controls=pickers();
  assert.deepEqual(controls.map(n=>n.props.label),['Section','Category']);
  controls[1].props.onChange('food');controls=pickers();assert.deepEqual(controls.map(n=>n.props.label),['Section','Category','Subcategory']);
  controls[2].props.onChange('cafe');controls=pickers();controls[1].props.onChange('leaf');controls=pickers();
  assert.equal(props.filter.subcategory,'');assert.equal(controls.length,2,'leaf categories never show an empty subcategory picker');
  props={...props,section:'events',filter:filter()};assert.deepEqual(pickers().map(n=>n.props.label),['Section','Filter']);
  assert.ok(nodes(h.render(Panel,props)).find(n=>n.type==='Dates'));
});
test('home discovery pickers use the section blue and the shared locator font',()=>{
  const panel=read('components/home/HomeDiscoveryPanel.tsx');
  assert.equal((panel.match(/primaryColor="#59ABE3"/g)||[]).length,3);
  assert.match(panel,/LOCATOR_FONT_FAMILY \} from "..\/..\/lib\/designTokens"/);
  assert.match(panel,/fontFamily: LOCATOR_FONT_FAMILY\.semibold/);
  assert.match(panel,/fontFamily: LOCATOR_FONT_FAMILY\.regular/);
});
test('shared footer sends guests only through public App or login and preserves authenticated actions',()=>{
  const navigation=load('lib/navigation/bottomNavigation.ts');
  for(const authenticated of [false,true])for(const business of [false,true]){
    const h=host(),calls=[];
    const Footer=load('components/navigation/AppBottomNavigation.tsx',{
      react:h.react,'@expo/vector-icons':{Ionicons:'Icon'},'react-native':{View:'View',Text:'Text',Pressable:'Button',Platform:{OS:'ios'},StyleSheet:{create:x=>x,hairlineWidth:1}},
      'expo-router':{usePathname:()=>'/app',useRouter:()=>({push:p=>calls.push(p),navigate:p=>calls.push(p)})},
      'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:34})},'react-i18next':{useTranslation:()=>({t:(k,f)=>f})},
      '../../context/AuthContext':{useAuth:()=>({user:authenticated?{}:null,sessionToken:authenticated?'session':null,loading:false,activeIdentity:business?{type:'business'}:null})},
      '../../context/BadgeContext':{useBadge:()=>({totalBadgeCount:12})},'../../context/CreateFlowContext':{useCreateFlow:()=>({openCreateSheet:()=>calls.push('create'),openBizActions:()=>calls.push('business')})},
      '../../hooks/useResponsiveLayout':{useResponsiveLayout:()=>({isDesktop:false})},'../../lib/designTokens':{COLORS:{}},'../../lib/illustrationSources.generated':{TAB_BAR_ILLUSTRATIONS:{}},
      '../../lib/navigation/bottomNavigation':navigation,'../../lib/navigation/tabLayout':{TAB_BAR_CONTENT_HEIGHT:64},'./TabArtworkButton':{default:'Art'},
    }).default;
    const tree=h.render(Footer),buttons=nodes(tree).filter(n=>n.type==='Button');assert.equal(buttons.length,5);
    assert.equal(tree.props.style[1].height,98);assert.equal(tree.props.style[1].paddingBottom,36);
    buttons.forEach(button=>button.props.onPress());
    assert.deepEqual(calls,authenticated?['/app','/(tabs)/home','/(tabs)/profile','/(tabs)/messages',business?'business':'create']:['/app','/login','/login','/login','/login']);
  }
});
test('retired Locator redirects only after auth and never imports map/fetching code',()=>{
  for(const authenticated of [false,true]){
    const h=host(),Route=load('app/(tabs)/locator.tsx',{react:h.react,'react-native':{ActivityIndicator:'Loading'},'expo-router':{Redirect:'Redirect',useLocalSearchParams:()=>({tab:'events',root_category:'food'})},
      '../../context/AuthContext':{useAuth:()=>({user:authenticated?{}:null,sessionToken:authenticated?'session':null,loading:false})}}).default;
    const tree=h.render(Route);assert.equal(tree.type,'Redirect');assert.equal(authenticated?tree.props.href.pathname:tree.props.href,authenticated?'/(tabs)/home':'/login');
  }
  assert.doesNotMatch(read('app/(tabs)/locator.tsx'),/BusinessMap|getNearby|LegacyLocatorScreen/);
  const home=read('app/(tabs)/home.tsx');assert.equal((home.match(/<MapSection\b/g)||[]).length,1);
  assert.ok(home.indexOf('<HomeDiscoveryPanel')>home.indexOf('<MapSection'));
  assert.ok(home.indexOf('<HomeDiscoveryPanel')<home.indexOf('{false && <>'));
  assert.doesNotMatch(read('components/home/HomeDiscoveryPanel.tsx'),/BusinessMap|LegacyLocatorScreen|FilterModal/);
});
