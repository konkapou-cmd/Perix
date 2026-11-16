const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020,
  } }).outputText, { exports, require: name => dependencies[name], console, ...globals });
  return exports;
}
// Small deterministic hook host. Real screen/provider functions and their
// handlers run; only platform/network boundaries are stubbed. No GPS/HTTP.
function host() {
  const slots = [], pending = [];
  let index = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: 'Fragment', createContext: () => ({ Provider: 'Provider' }),
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = index++; return slots[i] ||= { current: initial }; },
    useMemo(fn, deps) { const i = index++, old = slots[i];
      if (!old || !deps || deps.some((v, j) => !Object.is(v, old.deps[j]))) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback: (fn, deps) => React.useMemo(() => fn, deps),
    useSyncExternalStore: () => 1,
    useEffect(fn, deps) { const i = index++, old = slots[i];
      if (!old || !deps || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
        pending.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  return { react: { ...React, default: React }, render(fn, props) { index = 0; const tree = fn(props); pending.splice(0).forEach(f => f()); return tree; },
    unmount() { slots.forEach(s => s?.cleanup?.()); } };
}
const rn = { StyleSheet: { create: v => v }, useWindowDimensions: () => ({ width: 900, height: 900 }),
  View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', ScrollView: 'ScrollView', Modal: 'Modal', ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'web' }, Linking: {}, AppState: { addEventListener: () => ({ remove() {} }) } };
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const { findGatewayStops, stopMatchesMode } = load('lib/city/mobilityControls.ts');
const geometryTools = load('lib/city/visualGeometry.ts');
const { transitStopPins } = geometryTools;
const arrivalVehicleTools=load('lib/city/arrivalVehicle.ts',{'./visualGeometry':geometryTools});
const trackedTripTools=load('lib/city/trackedTrips.ts',{'./arrivalVehicle':arrivalVehicleTools,'./visualGeometry':geometryTools,
  './transitPublication':load('lib/city/transitPublication.ts'),'./transitPath':load('lib/city/transitPath.ts')});
const { journeyPlanLines } = load('lib/city/journeyDirections.ts');
const nearbyTools=load('lib/city/nearbyTransit.ts',{'./visualGeometry':{transitStopPins}});
const sceneTools=load('lib/city/sceneScope.ts',{'./nearbyTransit':nearbyTools});
const transitPathTools=load('lib/city/transitPath.ts');
const baseTools=load('lib/city/mapBase.ts');
const layoutTools=load('lib/city/mapLayout.ts');
const googleTools=load('lib/city/googleDirections.ts',{}, {URLSearchParams});
const departureBatchTools=load('lib/city/departureBatch.ts');
const stops = [
  { stop_id: 'mixed', name: 'Central', latitude: 52.14, longitude: 11.63, modes: ['bus', 'tram'], routes: [{ mode: 'tram', route_number: '1' },{mode:'bus',route_number:'1'}],
    platforms: [{ platform_id: 'bus-platform', latitude: 52.14, longitude: 11.63, modes: ['bus'] }, { platform_id: 'tram-platform', latitude: 52.1401, longitude: 11.63, modes: ['tram'] }] },
  { stop_id: 'bus', name: 'Bus stop', latitude: 52.15, longitude: 11.63, platform_id:'bus-only-platform', modes: ['bus'], routes: [] },
  { stop_id: 'far', name: 'Outside viewport', latitude: 52.5, longitude: 11.9, modes: ['tram'], routes: [] },
];
test('physical stop modes, not today’s routes, govern filtering; lookup searches the existing full catalogue', () => {
  assert.equal(stopMatchesMode(stops[0], 'bus'), true);
  assert.equal(stopMatchesMode(stops[0], 'taxi'), false);
  const center = { latitude: 52.14, longitude: 11.63 };
  assert.equal(findGatewayStops(stops, 'tram', 'outside', center)[0], stops[2]);
  assert.deepEqual(Array.from(findGatewayStops(stops, 'bus', '', center), s => s.stop_id), ['mixed', 'bus']);
  assert.equal(findGatewayStops(stops, 'taxi', '', center).length, 0);
  assert.equal(findGatewayStops(stops, 'all', '', center, 1).length, 1);
  assert.deepEqual(Array.from(nearbyTools.nearestTransitStops(stops,center,1,150),row=>row.stop.stop_id),['mixed']);
  assert.equal(nearbyTools.nearestTransitStops(stops,center,3,150).some(row=>row.stop.stop_id==='bus'),false);
  assert.equal(stops[0].stop_id, 'mixed');
});

function gatewayHost(stopFixture=stops,categoryFixture,landmarkFixture=[]) {
  const h = host(); let livePosition = null, locate, fleetReads = 0, mapReads = 0, stopReads=0, catalogueReads=0, nearbyLoaded=false;
  const nearbyCalls=[],nearbyMapCalls=[];
  const requestOrder=[];
  const sceneEvents=[];
  const fleetIdRequests=[];
  let manualOrigin=null;
  let mapBase=baseTools.DEFAULT_MAP_BASE,mapBaseRevision=0;
  let planner = async () => ({ itineraries: [] });
  let directoryRows=[];
  const directoryCalls=[];
  const planCalls = [];
  const routeCalls = [];
  let lastJourney;
  const journeyHook = load('hooks/city/useGatewayJourney.ts', { react: h.react,
    '../../lib/api/mobility': { planJourney: (...args) => { planCalls.push(args); return planner(...args); } },
  }).useGatewayJourney;
  const useGatewayJourney = (...args) => (lastJourney = journeyHook(...args));
  const scheduled = new Map(); let timerId = 0;
  const preview = { clock: 'untouched' };
  const vehicles = ['bus', 'tram', 'taxi'].map(mode => ({ vehicle_id: mode, mode, latitude: 52.14, longitude: 11.63,
    route_number: '1', estimated: mode !== 'taxi', pattern_id: 'p', network_version_id: 'v', service_date: '2026-11-05',
    motion: { publication_status: 'READY', preview }, trip_id:`${mode}-trip`,trip_instance_id:`v:2026-11-05:${mode}-trip` }));
  const line = { pattern_id: 'p', network_version_id: 'v', service_date: '2026-11-05', route_number:'1', mode: 'bus', valid: true, points: [] };
  const unrelatedLine = { ...line, pattern_id:'unrelated', route_number:'2' };
  const categories = categoryFixture || [{id:'public-services',label:'Public Services',query:{kinds:[],publicOnly:true,publicCategory:'public-services'}},
    {id:'businesses',label:'Businesses',query:{kinds:['business']},children:[
      {id:'food-dining',label:'Food & Dining',query:{kinds:['business'],root:'food-dining'},children:[
        {id:'restaurants',label:'Restaurants',query:{kinds:['business'],root:'food-dining',subcategories:['restaurants']}}
      ]}
    ]}, { id: 'mobility', label: 'Mobility', query: { mobilityOnly: true }, children: [
    { id: 'bus', label: 'Bus', query: { mobilityOnly: true, mobilityMode: 'bus' } },
    { id: 'tram', label: 'Tram', query: { mobilityOnly: true, mobilityMode: 'tram' } },
    { id: 'taxi', label: 'Taxi', query: { mobilityOnly: true, mobilityMode: 'taxi' } },
  ] }];
  const mockGetNearbyStops = async (_token,origin,bounds,options) => {stopReads++;nearbyCalls.push({origin,bounds,options});requestOrder.push('nearby-stops');return {stops:stopFixture};};
  const mockGetNearbyMap = async (_token,origin,bounds) => { const key=`${origin?.latitude}:${origin?.longitude}`;
    if(!nearbyMapCalls.some(call=>call.key===key)){nearbyLoaded=true;mapReads++;nearbyMapCalls.push({key,origin,bounds});requestOrder.push('nearby-map');}
    return {lines:[line,unrelatedLine],source_manifests:[]}; };
  const nearbyTransitCache = load('lib/city/nearbyTransitCache.ts', {
    '../api/mobility': { getNearbyStops: mockGetNearbyStops, getNearbyMap: mockGetNearbyMap },
    './nearbyTransit': nearbyTools,
  });
  const screen = load('components/city/CityGatewayScreen.tsx', {
    react: h.react, 'react-native': rn, '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-router': { router: {push:route=>routeCalls.push(route)} },
    'expo-asset':{Asset:{fromModule:()=>({uri:'/profile.webp'})}},
    '../../lib/city/publicServiceImages':{getPublicServiceImages:()=>({profile:1})},
    'react-native-safe-area-context':{SafeAreaView:'SafeArea'},'../../lib/city/mapLayout':layoutTools,
    'react-i18next': { useTranslation: () => ({ t: (key, fallback) => typeof fallback === 'string' ? fallback : key, i18n: { language: 'en' } }) },
    '../BusinessMap': { default: 'Map' }, '../icons/IllustratedIcon':{default:'IllustratedIcon',illustratedIconSource:()=>null},
    '../../context/AuthContext': { useAuth: () => ({ user: null, loading: false }) },
    '../../context/LocationContext': { useLocation: () => ({ livePosition, userOrigin:manualOrigin ?? (livePosition ? {...livePosition,kind:'live'} : null), useLiveLocation: () => locate() }) },
    '../../context/MapBoundsContext':{useMapBounds:()=>({mapBase,mapBaseRevision})},'../../lib/city/mapBase':baseTools,
    './MapScreenHeader':{default:'MapHeader'},
    '../shared/WoodBadge':{default:'WoodBadge'},
    '../navigation/AppBottomNavigation':{default:'Footer'},
    './MapLocationPopup':{default:'LocationPopup'}, './GatewayResultCard':{default:'ResultCard'},
    '../mobility/MobilityModeControls': { default: 'ModeControls' }, '../../lib/city/mobilityControls': { findGatewayStops, stopMatchesMode },
    '../mobility/JourneyDirectionsCard': { default: 'JourneyDirections' }, '../../hooks/city/useGatewayJourney': { useGatewayJourney },
    '../mobility/NearbyTransitSection':{default:'NearbyTransit'},
    '../mobility/GoogleDirectionsPreview':{default:'GooglePreview'}, '../../lib/city/googleDirections':googleTools,
    '../../lib/city/journeyDirections': { journeyPlanLines }, '../../lib/city/transitPath':transitPathTools,
     '../../lib/city/nearbyTransit':nearbyTools,
     '../../lib/city/nearbyTransitCache':nearbyTransitCache,
     '../../lib/city/sceneScope':sceneTools,
      '../../lib/city/arrivalVehicle':arrivalVehicleTools,
       '../../lib/city/departureBatch':departureBatchTools,
       '../../lib/city/trackedTrips':trackedTripTools,
    '../../lib/api/core': { apiRequest: async () => ({ categories: [] }) },
     '../../lib/api/mobility': { getLiveVehicles: async () => {throw Error('App must not request the full city fleet');},
        getNearbyVehicles: async (_token,_origin,_bounds,_initialSync,vehicleIds=[]) => {fleetReads++;requestOrder.push('nearby-vehicles');fleetIdRequests.push([...vehicleIds]);
          return vehicles.filter(vehicle=>vehicleIds.includes(vehicle.vehicle_id));},
       getNearbyStops: mockGetNearbyStops,
       getNearbyMap: mockGetNearbyMap,
       getTransitStops: async () => {catalogueReads++;return stopFixture;},
      getV2Map: async () => {throw Error('App must not request the full city map');}, missingVisualGeometryKeys: () => [],
      searchPlaces: async () => ({ places: [{ name: 'Destination', lat: 52.13, lng: 11.62 }, { name: 'Other destination', lat: 52.2, lng: 11.7 }],
        stops: [{ stop_id: 'mixed', name: 'Central', lat: 52.14, lng: 11.63 }] }) },
    '../../lib/categoryTranslation': {}, '../../lib/city/publicServices': { MAGDEBURG_BOUNDS: { minLat: 52, maxLat: 52.3, minLng: 11.5, maxLng: 11.8 },
      PUBLIC_SERVICE_THEME: {}, getPublicServiceTaxonomy: async () => null },
    '../../lib/fontScale': { subscribeFontScale: () => () => {}, getFontScaleVersion: () => 1 },
    '../../lib/city/areas': (() => {
      const magdeburg = { id: 'magdeburg', countryCode: 'DE', cityId: 'de-magdeburg', label: { el: 'Μαγδεβούργο', de: 'Magdeburg', en: 'Magdeburg' },
        bounds: { minLat: 52, maxLat: 52.3, minLng: 11.5, maxLng: 11.8 },
        initialRegion: { latitude: 52.14, longitude: 11.635, latitudeDelta: 0.16, longitudeDelta: 0.23 },
        isHomeArea: true, mobilityEnabled: true };
      const gardelegen = { id: 'gardelegen', countryCode: 'DE', cityId: 'de-gardelegen', label: { el: 'Γκάρντελεγκεν', de: 'Gardelegen', en: 'Gardelegen' },
        bounds: { minLat: 52.415, maxLat: 52.634, minLng: 11.11, maxLng: 11.604 },
        initialRegion: { latitude: 52.527, longitude: 11.393, latitudeDelta: 0.30, longitudeDelta: 0.55 },
        isHomeArea: false, mobilityEnabled: false };
      const AREAS = [magdeburg, gardelegen];
      const inBounds = (area, p) => p && p.latitude >= area.bounds.minLat && p.latitude <= area.bounds.maxLat
        && p.longitude >= area.bounds.minLng && p.longitude <= area.bounds.maxLng;
      return { AREAS, DEFAULT_AREA_ID: 'magdeburg', getArea: id => AREAS.find(a => a.id === id) || AREAS[0],
        areasInScope: bounds => AREAS.filter(a => bounds.minLat <= a.bounds.maxLat && bounds.maxLat >= a.bounds.minLat
          && bounds.minLng <= a.bounds.maxLng && bounds.maxLng >= a.bounds.minLng),
        mobilityAreaFor: point => AREAS.find(a => a.mobilityEnabled && inBounds(a, point)) || null };
    })(),
    '../../lib/city/gateway': { ALL_QUERY: {}, gatewayCategories: () => categories },
    '../../hooks/city/useCityDiscovery': { useCityDiscovery: (...args) => {if(args[4]){if(!directoryCalls.length)sceneEvents.push('directory-ready');directoryCalls.push(args);}const filter=args[0];
      return {items:!args[4]?[]:filter.publicOnly?directoryRows.filter(x=>x.type==='public_service'):
        filter.kinds?.length?directoryRows.filter(x=>filter.kinds.includes(x.type)):directoryRows,
        loading:false,partial:false,error:null,hasMore:false,more:async()=>{},retry:()=>{}}; } },
    '../../lib/city/transitAttribution': { hasOsmTransitRouting: () => false, schedulePublisher: () => null },
    './CityInlineDetails': { default: 'Details' }, '../brand/PerixLogo': { default: 'Logo' },
    '../../lib/designTokens': { BORDER_RADIUS: {}, COLORS: {}, FONT_SIZES: {}, FONT_WEIGHTS: {}, SHADOWS: {}, LOCATOR_FONT_FAMILY: { regular: 'r', semibold: 's', bold: 'b' } },
    '../../lib/city/mapPresentation': { directoryEmblemCandidates: () => [] },
    '../../lib/city/presentation': { gatewayEntityColor: () => '', gatewayNodeColor: () => '', GATEWAY_ENTITY_COLORS: {} }, '../../lib/categoryIcons': { CATEGORY_COLORS: {} },
    '../../lib/city/localization': { localizeGatewayNodes: v => v, confirmedEmpty: () => false }, '../../i18n/city': { CITY_ROOT_IDS: [] },
     './CityLanguagePicker': { default: 'Language' }, '../../lib/city/fleetPoller': { startFleetPolling: options => {
        options.load().then(value=>{if(Array.isArray(value)&&value.some(row=>row.vehicle_id))sceneEvents.push('vehicles-published');options.publish(value);}); return () => {};
      } }, '../../lib/city/transitPublication': {}, '../../lib/city/visualGeometry': { ...geometryTools, visualGeometryReady: () => true, distinctGeometryLines: v => v, transitStopPins },
      '../../lib/city/landmarks': { ALL_LANDMARKS: landmarkFixture, ISLAND_LANDMARK_LABEL_ZOOM:17, landmarkImageSource: () => null },
     './TransitSourceNotice': { default: 'Notice' },
  }, { setTimeout: fn => { scheduled.set(++timerId, fn); return timerId; }, clearTimeout: id => scheduled.delete(id) }).default;
  let tree,mapReady=false,paintedLandmarks;
  return { render() {
      tree = h.render(screen, {});
      let map=nodes(tree).find(n=>n.type==='Map');
      if(map&&!mapReady){mapReady=true;sceneEvents.push('map-ready');map.props.onMapReady?.();tree=h.render(screen,{});map=nodes(tree).find(n=>n.type==='Map');}
      if(map&&map.props.landmarks!==paintedLandmarks){paintedLandmarks=map.props.landmarks;
        if(fleetReads || nearbyLoaded&&!stopFixture.length)sceneEvents.push('buildings-painted');
        map.props.onLandmarksReady?.();tree=h.render(screen,{});}
      return tree;
    }, sceneEvents, all: () => nodes(tree), map: () => nodes(tree).find(n => n.type === 'Map').props,
    selectMode(mode){
      const all=nodes(tree).find(n=>n.type==='Pressable' && n.props.accessibilityLabel==='ui.all');
      if(all){all.props.onPress();this.render();}
      if(mode==='all')return;
      nodes(tree).find(n=>n.type==='Pressable' && n.props.accessibilityLabel==='Mobility').props.onPress();this.render();
      nodes(tree).find(n=>n.type==='Pressable' && n.props.accessibilityLabel===mode[0].toUpperCase()+mode.slice(1)).props.onPress();this.render();
    },
    pin: value => { livePosition = value; }, locate: fn => { locate = fn; }, unmount: h.unmount,
    patchVehicle:(mode,values)=>Object.assign(vehicles.find(v=>v.mode===mode),values),
     origin:value=>{manualOrigin=value;},currentOrigin:()=>manualOrigin ?? (livePosition?{...livePosition,kind:'live'}:null),
    rows:value=>{directoryRows=value;},directoryCalls,
    base:value=>{mapBase=value;mapBaseRevision++;},
      reads: () => [fleetReads, mapReads], stopReads:()=>stopReads,catalogueReads:()=>catalogueReads,
      arrivalRows:()=>vehicles.filter(v=>v.mode==='bus'||v.mode==='tram').map(v=>({vehicle_id:v.vehicle_id,
        trip_id:`${v.mode}-trip`,trip_instance_id:`${v.network_version_id}:${v.service_date}:${v.mode}-trip`,
        pattern_id:v.pattern_id,network_version_id:v.network_version_id,service_date:v.service_date,
        route_number:v.route_number,mode:v.mode,platform_id:nodes(tree).find(n=>n.type==='NearbyTransit')?.props.stops?.[0]?.platform_id || `${v.mode}-platform`,vehicle_link_basis:'EXACT_TRIP'})),
      arrivalUpdate:(rows,visibleCount=2,key)=>{
        const section=nodes(tree).find(n=>n.type==='NearbyTransit') || nodes(tree).find(n=>n.type==='Details');
        if(!key)for(const other of (section?.props.stops || []).slice(1))section.props.onArrivalsUpdate?.(`stop:${other.stop_id}|`,[],0);
        key ||= `stop:${section?.props.stops?.[0]?.stop_id || 'mixed'}|`;
        section?.props.onArrivalsUpdate?.(key,rows,visibleCount);
      },
      nearbyCalls,nearbyMapCalls,requestOrder,fleetIdRequests, preview,
    planCalls, routeCalls, planner: fn => { planner = fn; }, directions: () => nodes(tree).find(n=>n.type==='JourneyDirections')?.props,
    timers() { const work = [...scheduled.values()]; scheduled.clear(); work.forEach(fn => fn()); } };
}
async function readyAtOrigin(g,origin={latitude:52.14,longitude:11.63,kind:'manual',name:'Confirmed location'}){
  if(origin)g.origin(origin);
  g.render();
  const point=origin || g.currentOrigin() || {latitude:52.14,longitude:11.63};
  g.map().onRegionChangeComplete({minLat:point.latitude-0.01,maxLat:point.latitude+0.01,
    minLng:point.longitude-0.01,maxLng:point.longitude+0.01});
  g.render();
  for(let i=0;i<6;i++){g.timers();await flush();g.render();}
  if(!g.requestOrder.includes('nearby-vehicles')){
    g.arrivalUpdate(g.arrivalRows(),2);g.render();await flush();g.render();
  }
  await flush();g.render();
}
test('App root is public-services-only, has no transport selector, and moving fleet/map geometry remain visible', async () => {
  const g = gatewayHost(); await readyAtOrigin(g);
  assert.deepEqual(g.reads(),[1,1]);
  assert.equal(g.map().markers.length, 3); // bus, tram and confirmed manual-origin pin
  assert.equal(g.map().markers[0].motionPreview, g.preview);
  assert.equal(g.all().some(n=>n.type==='ModeControls'),false);
  const labels=g.all().filter(n=>n.props.testID==='city-category-grid').flatMap(n=>nodes(n).filter(x=>x.type==='Pressable').map(x=>x.props.accessibilityLabel));
  assert.equal(labels[0],'Public Services');assert.ok(labels.includes('Businesses'),'other categories remain selectable');
  assert.equal(g.map().markers.some(m=>m.type==='bus'),true);assert.equal(g.map().markers.some(m=>m.type==='tram'),true);
  assert.ok(g.map().transitStops.length>0);assert.deepEqual(g.map().transitLines.map(line=>line.routeNumber),['1']);
  assert.deepEqual(g.reads(), [1, 1]); assert.equal(g.map().authoritativeTransit, true);
});
test('scene loading prioritizes map and dated fleet before the 10km building batch and directory pins',async()=>{
  const landmarks=[{id:'MD-near',latitude:52.14,longitude:11.63},{id:'MD-5km',latitude:52.18,longitude:11.63},
    {id:'MD-far',latitude:52.5,longitude:11.63}];
  const g=gatewayHost(stops,undefined,landmarks);await readyAtOrigin(g);
  assert.deepEqual(g.map().landmarks.map(row=>row.id),['MD-near','MD-5km']);
  assert.ok(g.sceneEvents.indexOf('map-ready')<g.sceneEvents.indexOf('vehicles-published'));
  assert.ok(g.sceneEvents.indexOf('vehicles-published')<g.sceneEvents.indexOf('buildings-painted'));
  assert.ok(g.sceneEvents.indexOf('buildings-painted')<g.sceneEvents.indexOf('directory-ready'));
  const key=JSON.stringify(g.directoryCalls.at(-1)[1]),loaded=g.map().landmarks;
  for(let i=0;i<8;i++){
    g.map().onRegionChangeComplete({minLat:52+i*.01,maxLat:52.3+i*.01,minLng:11.4,maxLng:11.9});g.render();
    assert.equal(JSON.stringify(g.directoryCalls.at(-1)[1]),key);
    assert.equal(g.map().landmarks,loaded,'zoom/pan cannot unload or recreate the building scope');
  }
  g.unmount();
});

test('public services, SOS, business families and subcategories reuse large image buttons without changing selection logic',async()=>{
  const categories=[{id:'public-services',label:'Public Services',query:{kinds:[],publicOnly:true,publicCategory:'public-services'}},
    {id:'sos',label:'Emergency – SOS',query:{kinds:[],publicCategory:'ps:sos'}},
    {id:'businesses',label:'Businesses',query:{kinds:['business']},children:[
      {id:'food-dining',label:'Food & Dining',query:{kinds:['business'],root:'food-dining'},children:[
        {id:'restaurants',label:'Restaurants with a long translated label',query:{kinds:['business'],root:'food-dining',subcategories:['restaurants']}}]}]}];
  const g=gatewayHost(stops,categories);await readyAtOrigin(g);const reads=g.reads();
  const expected=layoutTools.categoryButtonMetrics(900);
  const check=id=>{
    const b=g.all().find(n=>n.props.testID===`city-category-button-${id}`);assert.ok(b,id);
    assert.equal(b.props.accessibilityRole,'button');assert.equal(b.props.style({pressed:false})[0].backgroundColor,undefined);
    assert.ok(b.props.style({pressed:true})[1].opacity<1);
    const face=nodes(b).find(n=>n.props.testID===`city-category-face-${id}`);
    const style=Object.assign({},...face.props.style.filter(Boolean));
    assert.equal(style.width,expected.faceSize);assert.equal(style.height,expected.faceSize);
    const art=nodes(b).find(n=>n.type==='IllustratedIcon');assert.equal(art.props.size,expected.iconSize);
    assert.equal(nodes(b).find(n=>n.type==='Text').props.numberOfLines,3);
    return b;
  };
  check('public-services');check('sos');check('businesses').props.onPress();g.render();
  check('food-dining').props.onPress();g.render();
  const leaf=check('restaurants');assert.equal(leaf.props.accessibilityLabel,'Restaurants with a long translated label');
  leaf.props.onPress();g.render();assert.deepEqual(g.reads(),reads,'button styling must not reload the transport scope');
  g.unmount();
});

async function chooseSearchResult(g, index = 0, query = 'Destination',perix=false) {
  g.all().find(n => n.type === 'TextInput' && n.props.placeholder === 'Where do you want to go?').props.onChangeText(query);
  g.render(); g.timers(); await flush(); g.render();
  const suggestions = g.all().find(n => n.props.testID === 'city-suggestions');
  nodes(suggestions).filter(n => n.type === 'Pressable')[index].props.onPress(); g.render();
  if(perix){g.map().onMarkerPress('gateway-destination');g.render();}
}
const itinerary = { departure: '12:00', arrival: '12:20', duration_minutes: 20, walking_minutes: 5,
  legs: [{ type: 'walk', minutes: 3, label: 'Boarding stop', points: [[52.1, 11.6], [52.11, 11.61]] },
    { type: 'ride', mode: 'tram', route_number: '1', direction: 'South', board: 'Boarding stop', alight: 'Central', depart: '12:03', arrive: '12:18',
      minutes: 15, points: [[52.11, 11.61], [52.14, 11.63]] },
    { type: 'walk', minutes: 2, label: 'destination', points: [[52.14, 11.63], [52.13, 11.62]] }] };

test('search plans to a place or stop from actual live coordinates, never the camera center', async () => {
  const g = gatewayHost(); g.pin({ latitude: 52.1, longitude: 11.6 });
  g.planner(async () => ({ itineraries: [itinerary] })); await readyAtOrigin(g,null);
  await chooseSearchResult(g,0,'Destination',true); await flush(); g.render();
  assert.deepEqual(Array.from(g.planCalls[0]), [null, 52.1, 11.6, 52.13, 11.62]);
  assert.equal(g.directions().journey.plan, itinerary); assert.equal(g.map().planLines.length, 3);
  g.map().onRegionChangeComplete({ minLat: 51, maxLat: 52, minLng: 10, maxLng: 11 }); g.render();
  g.pin({ latitude: 52.12, longitude: 11.61 }); g.render(); assert.equal(g.planCalls.length, 1);
  g.directions().onRetry(); g.render(); await flush(); g.render();
  assert.deepEqual(Array.from(g.planCalls[1]).slice(1, 3), [52.12, 11.61]);
  await chooseSearchResult(g, 2, 'Central',true); await flush(); g.render();
  assert.deepEqual(Array.from(g.planCalls[2]).slice(3), [52.14, 11.63]);
});
test('the origin gate starts no map or mobility reads; a confirmed live fix unlocks nearby-first loading', async () => {
  const rootLayout=fs.readFileSync(path.join(__dirname,'../app/_layout.tsx'),'utf8');
  assert.doesNotMatch(rootLayout,/preloadGoogleMaps/, 'Google Maps must not be fetched before a confirmed origin');
  const g = gatewayHost();g.render();await flush();g.render();
  assert.ok(g.all().some(n=>n.props.testID==='city-origin-gate'));assert.equal(g.all().some(n=>n.type==='Map'),false);
  assert.deepEqual(g.reads(),[0,0]);assert.equal(g.stopReads(),0);assert.equal(g.catalogueReads(),0);assert.deepEqual(g.directoryCalls,[]);
  const fix = { latitude: 52.1, longitude: 11.6 };
  g.pin(fix);await readyAtOrigin(g,null);
  assert.ok(g.all().some(n=>n.type==='Map'));assert.deepEqual(g.reads(),[0,1]);
  assert.equal(g.stopReads(),1);assert.equal(g.catalogueReads(),1);assert.ok(g.requestOrder.indexOf('nearby-map')>=0);
  assert.equal(g.requestOrder.includes('map'),false);
  assert.ok(g.requestOrder.indexOf('nearby-stops')<g.requestOrder.indexOf('nearby-map'));
  assert.equal(g.requestOrder.includes('nearby-vehicles'),false,'no dated arrivals exist within the confirmed scope');
});
test('App shows one station within 150 m before routes and waits for its two departure identities before vehicles',async()=>{
  const g=gatewayHost();g.origin({latitude:52.14,longitude:11.63,kind:'manual',name:'Confirmed'});g.render();
  g.map().onRegionChangeComplete({minLat:52.13,maxLat:52.15,minLng:11.62,maxLng:11.64});g.render();g.timers();await flush();g.render();
  const nearby=()=>g.all().find(n=>n.type==='NearbyTransit');
  assert.equal(nearby().props.stops.length,1);assert.deepEqual(g.requestOrder,['nearby-stops']);
  g.timers();await flush();g.render();
  assert.deepEqual(g.requestOrder.slice(0,2),['nearby-stops','nearby-map']);
  assert.equal(g.requestOrder.includes('nearby-vehicles'),false,'vehicles wait until timetable trip identities are known');
  g.arrivalUpdate(g.arrivalRows(),2);g.render();await flush();g.render();
  assert.deepEqual(g.requestOrder.slice(0,3),['nearby-stops','nearby-map','nearby-vehicles']);
  assert.equal(g.map().transitLines.length,1);
});

test('five-station first wave waits for all boards; the second wave follows the first fleet response',async()=>{
  const fixture=Array.from({length:5},(_,i)=>({stop_id:'s'+i,name:'Station '+i,latitude:52.14+i*.0001,longitude:11.63,
    platform_id:'p'+i,modes:['tram'],routes:[{mode:'tram',route_number:'1'}]}));
  const g=gatewayHost(fixture);g.origin({latitude:52.14,longitude:11.63,kind:'manual'});g.render();
  for(let i=0;i<6;i++){g.timers();await flush();g.render();}
  const arrivals=i=>[0,1].map(round=>({vehicle_id:`v${i}-${round}`,trip_id:`t${i}-${round}`,trip_instance_id:`dated:t${i}-${round}`,
    network_version_id:'v',service_date:'2026-11-09',pattern_id:'p',platform_id:'p'+i,mode:'tram',route_number:'1',eta_seconds:60+round*300}));
  for(let i=0;i<4;i++){g.arrivalUpdate(arrivals(i),2,`stop:s${i}|`);g.render();await flush();}
  assert.equal(g.fleetIdRequests.length,0,'do not start a partial first wave just because one board responded quickly');
  g.arrivalUpdate(arrivals(4),2,'stop:s4|');g.render();await flush();g.render();
  assert.deepEqual(g.fleetIdRequests[0],fixture.map((_,i)=>`v${i}-0`));
  await flush();g.render();
  assert.equal(g.fleetIdRequests[1].length,10,'the second round adds vehicles without discarding the first round');
  assert.equal(g.nearbyCalls[0].options.limit,5);assert.equal(g.nearbyCalls[0].options.radiusM,150);
  g.unmount();
});
test('clicking a map stop re-centers the staged nearby sequence there and uses only nearby fleet reads',async()=>{
  const g=gatewayHost();await readyAtOrigin(g);
  const marker=g.map().transitStops.find(stop=>stop.stop_id==='bus');
  assert.ok(marker,'fixture should contain a distinct clickable nearby station');
  const before=g.stopReads(),vehiclesBefore=g.requestOrder.filter(item=>item==='nearby-vehicles').length;
  g.map().onTransitStopPress(marker);g.render();
  assert.equal(g.requestOrder.filter(item=>item==='nearby-vehicles').length,vehiclesBefore,
    'the previous fleet is not polled while the clicked stop stages its fresh stops and routes');
  for(let i=0;i<6;i++){g.timers();await flush();g.render();}
  assert.ok(g.stopReads()>before,'selecting another station triggers a fresh nearby-stops stage');
  assert.equal(g.nearbyCalls.at(-1).origin.latitude,marker.latitude);
  assert.equal(g.nearbyCalls.at(-1).origin.longitude,marker.longitude);
  g.arrivalUpdate(g.arrivalRows(),2);g.render();await flush();g.render();
  const selectedMapIndex=g.requestOrder.lastIndexOf('nearby-map');
  const selectedStopsIndex=g.requestOrder.lastIndexOf('nearby-stops');
  const vehicleIndex=g.requestOrder.lastIndexOf('nearby-vehicles');
  assert.ok(selectedStopsIndex>=0 && selectedStopsIndex<selectedMapIndex,
    'the clicked stop cards are loaded before requesting their route stage');
  assert.ok(selectedMapIndex<vehicleIndex,'the clicked stop route stage completes before its fleet poll');
  assert.ok(g.requestOrder.includes('nearby-vehicles'));
  assert.equal(g.requestOrder.includes('fleet'),false);
});
test('zooming out does not request a new station, route, or fleet result',async()=>{
  const g=gatewayHost();await readyAtOrigin(g);
  const reads=g.reads(),stopReads=g.stopReads(),catalogueReads=g.catalogueReads(),calls=g.nearbyCalls.length;
  g.map().onRegionChangeComplete({minLat:51.8,maxLat:52.4,minLng:11.1,maxLng:12.1});g.render();
  assert.deepEqual(g.reads(),reads);assert.equal(g.stopReads(),stopReads);assert.equal(g.catalogueReads(),catalogueReads);
  assert.equal(g.nearbyCalls.length,calls,'the request bounds remain anchored to the station, not the map camera');
});
test('a late old destination response or error never replaces a newer route, and clearing removes route geometry', async () => {
  const g = gatewayHost(); let first;
  g.pin({ latitude: 52.1, longitude: 11.6 });
  g.planner(() => new Promise(resolve => { first = resolve; }));
  await readyAtOrigin(g,null); await chooseSearchResult(g,0,'Destination',true);
  g.planner(async () => ({ itineraries: [itinerary] }));
  await chooseSearchResult(g, 1, 'Other',true); await flush(); g.render();
  first({ itineraries: [], note: 'old note' }); await flush(); g.render();
  assert.equal(g.directions().journey.status, 'ready'); assert.equal(g.directions().journey.note, undefined);
  g.all().find(n => n.props.testID === 'city-close-destination').props.onPress(); g.render();
  assert.equal(g.directions(), undefined); assert.equal(g.map().planLines.length, 0);
});
test('planner errors have a retry path and never fabricate an itinerary', async () => {
  const g = gatewayHost(); g.pin({ latitude: 52.1, longitude: 11.6 });
  g.planner(async () => { throw Error('offline'); }); g.render(); await flush(); g.render();
  await chooseSearchResult(g,0,'Destination',true); await flush(); g.render();
  assert.equal(g.directions().journey.status, 'error'); assert.equal(g.map().planLines.length, 0);
  g.planner(async () => ({ itineraries: [], note: 'No service available' }));
  g.directions().onRetry(); g.render(); await flush(); g.render();
  assert.equal(g.directions().journey.status, 'empty'); assert.equal(g.directions().journey.note, 'No service available');
});
test('directions present walking, transfers and actual boarding/alighting instructions from the existing plan', () => {
  const h = host();
  const translate = (key, fallback, values = {}) => typeof fallback === 'string'
    ? fallback.replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] ?? '') : key;
  const card = load('components/mobility/JourneyDirectionsCard.tsx', { react: h.react, 'react-native': rn,
    'react-i18next': { useTranslation: () => ({ t: translate }) },
  }).default;
  const tree = h.render(card, { journey: { status: 'ready', plan: { ...itinerary, legs: [...itinerary.legs,
    { type: 'walk_transfer', minutes: 1, label: 'Next stop' }] } }, onRetry() {} });
  const text = nodes(tree).filter(n => n.type === 'Text').map(n => n.props.children.flat().join('')).join('\n');
  assert.match(text, /board at 12:03 \(Boarding stop\), alight at 12:18 \(Central\)/);
  assert.match(text, /Walk 3′ to Boarding stop/); assert.match(text, /Transfer: walk 1′ to Next stop/);
  assert.match(text, /your destination \(arrival 12:20\)/);
  const lines = journeyPlanLines(itinerary);
  assert.equal(lines[0].color, '#59ABE3'); assert.equal(lines[1].color, '#166534');
  assert.equal(journeyPlanLines({ legs: [{ points: [[NaN, 1], [91, 1], null] }] }).length, 0);
});
test('gateway preserves platform-specific arrivals selection', async () => {
  const g = gatewayHost(); await readyAtOrigin(g);
  g.map().onTransitStopPress({ ...stops[0], platform_id: 'tram-platform' }); g.render();
  const detail = g.all().find(n => n.type === 'Details');
  assert.equal(detail.props.entity.facts.platform_id, 'tram-platform');
});

test('Google preview reuses search destination and explicit origin without replacing transit geometry or changing map dimensions', async () => {
  const g = gatewayHost(); g.origin({ latitude:52.1, longitude:11.6, kind:'manual', name:'Manual origin' });
  g.planner(async () => ({ itineraries:[itinerary] })); await readyAtOrigin(g,null);
  const originalHeight=g.map().height;
  await chooseSearchResult(g); await flush(); g.render();
  const preview=g.all().find(n=>n.type==='GooglePreview');
  assert.equal(preview.props.destination.title,'Destination');
  assert.equal(preview.props.origin.kind,'manual'); assert.equal(preview.props.origin.latitude,52.1);
  assert.equal(g.map().height,originalHeight); assert.equal(g.map().planLines.length,0);
  assert.equal(preview.props.initiallyOpen,true);assert.equal(g.planCalls.length,0); assert.deepEqual(g.reads(),[0,1]);
});

test('map-point selection keeps the confirmed origin and never substitutes the map center', async () => {
  const g = gatewayHost(); await readyAtOrigin(g);
  g.map().onMapPress(52.1256,11.6342); g.render();
  const preview=g.all().find(n=>n.type==='GooglePreview');
  assert.equal(preview.props.destination.latitude,52.1256); assert.equal(preview.props.destination.longitude,11.6342);
  assert.equal(preview.props.origin.latitude,52.14);assert.equal(preview.props.origin.longitude,11.63);
  assert.notEqual(preview.props.origin.latitude,52.1256);
  g.map().onMapPress(52.1267,11.6353);g.render();
  assert.equal(g.map().markers.filter(marker=>marker.selectionCompass).length,1);
  assert.deepEqual([g.map().markers.find(marker=>marker.selectionCompass).latitude,g.map().markers.find(marker=>marker.selectionCompass).longitude],[52.1267,11.6353]);
  g.map().onMapPress(NaN,181); g.render();
  assert.equal(g.all().find(n=>n.type==='GooglePreview').props.destination.latitude,52.1267);
  g.all().find(n=>n.props.testID==='city-close-destination').props.onPress();g.render();
  assert.equal(g.all().find(n=>n.type==='GooglePreview'),undefined);
  assert.equal(g.all().find(n=>n.props.testID==='city-destination'),undefined);
  assert.equal(g.map().markers.some(marker=>marker.selectionCompass),false);
  assert.equal(g.all().find(n=>n.type==='TextInput' && n.props.placeholder==='Where do you want to go?').props.value,'');
});

test('map/landmark selection opens Google; the one compass starts PERIX and all close paths remove it',async()=>{
  const g=gatewayHost();await readyAtOrigin(g);g.planner(async()=>({itineraries:[itinerary]}));
  g.map().onMapPress(52.1256,11.6342);g.render();await flush();g.render();
  let google=g.all().find(n=>n.type==='GooglePreview');
  assert.equal(google.props.initiallyOpen,true);assert.equal(g.planCalls.length,0);
  assert.equal(g.map().markers.filter(m=>m.selectionCompass).length,1);
  g.map().onMapPress(52.1267,11.6353);g.render();
  assert.equal(g.map().markers.filter(m=>m.selectionCompass).length,1);
  assert.equal(g.map().markers.find(m=>m.selectionCompass).latitude,52.1267);
  g.map().onMarkerPress('gateway-destination');g.render();await flush();g.render();
  assert.equal(g.all().some(n=>n.type==='GooglePreview'),false);
  assert.equal(g.directions().journey.plan,itinerary);assert.equal(g.planCalls.length,1);
  assert.deepEqual(Array.from(g.planCalls[0]).slice(-2),[52.1267,11.6353]);
  g.all().find(n=>n.props.testID==='city-close-destination').props.onPress();g.render();
  assert.equal(g.map().markers.some(m=>m.selectionCompass),false);assert.equal(g.map().planLines.length,0);
  g.map().onMapPress(52.1256,11.6342);g.render();
  google=g.all().find(n=>n.type==='GooglePreview');google.props.onClose();g.render();
  assert.equal(g.map().markers.some(m=>m.selectionCompass),false);
  assert.equal(g.all().some(n=>n.props.testID==='city-destination'),false);
  g.unmount();
});

test('selected station is first, with a six-place scope for itself plus five neighbours',async()=>{
  const fixture=Array.from({length:7},(_,i)=>({stop_id:'s'+i,name:'Station '+i,latitude:52.14+i*.0001,longitude:11.63,
    platform_id:'p'+i,modes:['tram'],routes:[{mode:'tram',route_number:'1'}]}));
  const g=gatewayHost(fixture);await readyAtOrigin(g);
  g.map().onTransitStopPress(fixture[2]);g.render();
  const own=g.all().find(n=>n.type==='Details');assert.equal(own.props.entity.id,'stop:s2');
  assert.equal(typeof own.props.onArrivalsUpdate,'function');
  for(let i=0;i<6;i++){g.timers();await flush();g.render();}
  const section=g.all().find(n=>n.type==='NearbyTransit');
  assert.equal(section.props.stops[0].stop_id,'s2');assert.equal(section.props.stops.length,6);
  assert.equal(section.props.excludeStopId,'s2');assert.equal(section.props.stopLimit,5);
  assert.equal(g.nearbyCalls.at(-1).options.limit,6);assert.equal(g.nearbyCalls.at(-1).options.radiusM,3000);
  assert.ok(g.all().findIndex(n=>n.type==='Details')<g.all().findIndex(n=>n.type==='NearbyTransit'));
  g.unmount();
});

test('selected stationary stop offers Google preview without starting another transit plan or offering moving vehicles as destinations', async () => {
  const g = gatewayHost(); await readyAtOrigin(g);
  g.map().onTransitStopPress({...stops[0], platform_id:'tram-platform'}); g.render();
  const preview=g.all().find(n=>n.type==='GooglePreview');
  assert.equal(preview.props.destination.title,'Central'); assert.equal(g.planCalls.length,0);
  g.map().onMarkerPress('mobility:bus'); g.render();
  assert.equal(g.all().filter(n=>n.type==='GooglePreview').length,0);
});
test('map location button opens the shared popup without requesting GPS; selected origin focuses once while fixes only update the pin', async () => {
  const g = gatewayHost(); let calls = 0;
  g.locate(() => { calls++; });
  await readyAtOrigin(g);assert.equal(g.map().pinLocation, null); assert.equal(g.map().showUserLocation, false);
  const locateButton = () => g.all().find(n => n.props.testID === 'city-locate-me').props;
  locateButton().onPress(); locateButton().onPress(); g.render(); assert.equal(calls, 0);
  assert.equal(g.all().find(n=>n.type==='LocationPopup').props.visible,true);
  const fix = { latitude: 52.1, longitude: 11.6, accuracy: 10 };
  g.pin(fix);g.all().find(n=>n.type==='LocationPopup').props.onOriginSelect(fix);g.render();
  const token = g.map().focusToken;
  assert.equal(g.map().pinLocation, fix); assert.equal(g.map().focusRegion.latitude, fix.latitude);
  g.pin({ ...fix, latitude: 52.11 }); g.render(); assert.equal(g.map().focusToken, token);
  g.all().find(n=>n.type==='LocationPopup').props.onClose();g.render();
  assert.equal(g.map().focusToken, token); assert.equal(g.all().find(n=>n.type==='LocationPopup').props.visible,false);
});
test('destination and live avatar pin coexist, with camera authority belonging to the last explicit action', async () => {
  const g = gatewayHost(), fix = { latitude: 52.1, longitude: 11.6, accuracy: 10 };
  g.pin(fix); g.locate(async () => fix); await readyAtOrigin(g,null);
  const search = g.all().find(n => n.type === 'TextInput' && n.props.placeholder === 'Where do you want to go?');
  search.props.onChangeText('Destination'); g.render(); g.timers(); await flush(); g.render();
  const suggestions = g.all().find(n => n.props.testID === 'city-suggestions');
  nodes(suggestions).find(n => n.type === 'Pressable').props.onPress(); g.render();
  assert.equal(g.map().markers.find(m => m.id === 'gateway-destination').latitude, 52.13);
  assert.equal(g.map().pinLocation, fix); assert.equal(g.map().focusRegion.latitude, 52.13);
  await g.all().find(n => n.props.testID === 'city-locate-me').props.onPress(); g.render();
  g.all().find(n=>n.type==='LocationPopup').props.onOriginSelect(fix);g.render();
  assert.equal(g.map().focusRegion.latitude, fix.latitude);
  assert.ok(g.map().markers.find(m => m.id === 'gateway-destination'));
});
test('other existing categories remain selectable after Public Services is first', async () => {
  const g = gatewayHost(); await readyAtOrigin(g);
  const model=load('lib/city/gateway.ts',{'../api/core':{ACTIVITY_CATEGORIES:{},ACTIVITY_SUBCATEGORIES:{},ACTIVITY_TYPES:{}},
    '../api/events':{EVENT_THEMES:{}},'../marketplace/marketplaceTaxonomy':{MARKETPLACE_CATEGORIES:[]},
    '../config/serviceModules':{SERVICE_MODULES:{}},'../fieldRegistry':{FIELD_REGISTRY:{property_type:{options:[]}}},
    './publicServices':{},'../api/mobility':{},}) ;
  const categories=model.gatewayCategories([],null,x=>x);
  assert.ok(categories.some(n=>n.id==='mobility'));
  assert.equal(categories.find(n=>n.id==='events').children,undefined,'App Events remains a whole-category filter');
  assert.equal(categories.find(n=>n.id==='activities').children,undefined,'App Activities remains a whole-category filter');
  const labels=g.all().filter(n=>n.props.testID==='city-category-grid').flatMap(n=>nodes(n).filter(x=>x.type==='Pressable').map(x=>x.props.accessibilityLabel));
  assert.equal(labels[0],'Public Services');assert.ok(labels.includes('Businesses'));assert.ok(labels.includes('Mobility'));
  assert.equal(g.map().markers[0].type,'bus');assert.deepEqual(g.reads(),[1,1]);
});
test('App root category drilldown keeps empty-area category choices available and applies selected subcategory pins',async()=>{
  const g=gatewayHost();await readyAtOrigin(g);
  g.rows([{id:'biz-photo',type:'business',title:'Cafe',latitude:52.14,longitude:11.63,cover_image:'https://example.test/profile.jpg'}]);
  g.render();
  const press=label=>{const n=g.all().find(x=>x.type==='Pressable'&&x.props.accessibilityLabel===label);assert.ok(n,label);n.props.onPress();g.render();};
  press('Businesses');
  assert.ok(g.all().some(n=>n.props.accessibilityLabel==='Food & Dining'));
  press('Food & Dining');
  assert.ok(g.all().some(n=>n.props.accessibilityLabel==='Restaurants'));
  press('Restaurants');
  assert.equal(g.all().some(n=>n.props.testID==='city-category-grid'),false,'a selected leaf filters results instead of showing unrelated roots');
  assert.equal(g.directoryCalls.at(-1)[0].root,'food-dining');
  assert.deepEqual(g.directoryCalls.at(-1)[0].subcategories,['restaurants']);
  assert.equal(g.map().markers.find(m=>m.id==='business:biz-photo')?.pinImage,'https://example.test/profile.jpg');
});
test('App taxonomy choices load after the user confirms origin, independent of nearby-transit success',()=>{
  const source=read('components/city/CityGatewayScreen.tsx');
  const taxonomyRequest=source.indexOf('Promise.allSettled([apiRequest');
  const effect=source.slice(source.lastIndexOf('useEffect(() => {',taxonomyRequest),source.indexOf('// Keep the actual map node'));
  assert.match(effect,/if\(!hasConfirmedOrigin\)return/);
  assert.doesNotMatch(effect,/nearbyLinesLoaded/);
});
test('shared mode controls keep every mode accessible and call the owning screen only', () => {
  const h = host(), selected = [];
  const component = load('components/mobility/MobilityModeControls.tsx', { react: h.react, 'react-native': rn,
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'react-i18next': { useTranslation: () => ({ t: (_, fallback) => fallback }) },
  }).default;
  const buttons = nodes(h.render(component, { value: 'tram', onChange: mode => selected.push(mode) })).filter(n => n.type === 'Pressable');
  assert.equal(buttons.length, 8); assert.equal(buttons[2].props.accessibilityState.selected, true);
  buttons.forEach(b => b.props.onPress());
  assert.deepEqual(selected, ['all', 'bus', 'tram', 'subway', 's-bahn', 'rail', 'ferry', 'taxi']);
  assert.match(read('components/locator/LegacyLocatorScreen.tsx'), /<MobilityModeControls /);
  assert.doesNotMatch(read('components/city/CityGatewayScreen.tsx'), /<MobilityModeControls /);
  assert.match(read('components/BusinessMap.native.tsx'), /showsUserLocation=\{showUserLocation && !pinLocation\}/);
});
test('shared provider starts one public watch only after explicit reliable location and cleans it up', async () => {
  const h = host(); let watches = 0, stopsWatching = 0, callback;
  const listeners = new Map();
  const events = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const fix = { latitude: 52.1, longitude: 11.6, accuracy: 10 };
  let response = null;
  const provider = load('context/LocationContext.tsx', { react: h.react, 'react-native': rn,
    '@react-native-async-storage/async-storage': { default: { getItem: async () => null } },
    './AuthContext': { useAuth: () => ({ sessionToken: null }) }, '../lib/locationPermission': {
      getCurrentPositionWithPermission: async () => response, isReliablePosition: accuracy => accuracy < 100,
      watchPrecisePosition: cb => { watches++; callback = cb; return () => { stopsWatching++; }; },
    } }, { setInterval: () => 1, clearInterval: () => {}, window: events, document: events }).LocationProvider;
  const value = () => h.render(provider, {}).props.value;
  let v = value(); assert.equal(watches, 0);
  await v.useLiveLocation(); v = value(); assert.equal(watches, 0); assert.equal(v.livePosition, null);
  response = { ...fix, accuracy: 1000 }; await v.useLiveLocation(); v = value();
  assert.equal(watches, 0); assert.equal(v.livePosition, null);
  response = fix; await v.useLiveLocation(); v = value(); assert.equal(watches, 1);
  assert.equal(v.livePosition.latitude, fix.latitude);
  v.setManualLocation(52.4, 11.9); v = value();
  callback({ ...fix, latitude: 52.2 }); v = value();
  assert.equal(v.livePosition.latitude, 52.2); assert.equal(v.location.latitude, 52.4);
  assert.equal(v.userOrigin.kind,'live');
  v.setUserOrigin(52.3,11.8,'Entered address');v=value();
  callback({...fix,latitude:52.25});v=value();
  assert.equal(v.userOrigin.kind,'manual');assert.equal(v.userOrigin.latitude,52.3);assert.equal(v.livePosition.latitude,52.25);
  v.setUserOrigin(NaN,11.8,'Invalid');v=value();assert.equal(v.userOrigin.latitude,52.3);
  await v.useLiveLocation();v=value();assert.equal(v.userOrigin.kind,'live');assert.equal(v.userOrigin.latitude,fix.latitude);
  assert.equal(watches, 1); assert.equal(listeners.size, 2);
  h.unmount(); assert.equal(stopsWatching, 1); assert.equal(listeners.size, 0);
});

test('a restored explore area is never silently treated as a user origin',async()=>{
  const h=host();let gpsReads=0;
  const provider=load('context/LocationContext.tsx',{react:h.react,'react-native':rn,
    '@react-native-async-storage/async-storage':{default:{getItem:async()=>null}},
    './AuthContext':{useAuth:()=>({sessionToken:'session'})},'../lib/locationPermission':{
      isGeolocationGranted:async()=>false,isReliablePosition:()=>true,getCurrentPositionWithPermission:async()=>{gpsReads++;return null;},
    }}, {window:{localStorage:{getItem:()=>JSON.stringify({lat:52.14,lng:11.63,ts:Date.now()}),setItem(){}}}}).LocationProvider;
  h.render(provider,{});await flush();const value=h.render(provider,{}).props.value;
  assert.equal(value.location.latitude,52.14);assert.equal(value.livePosition,null);assert.equal(value.userOrigin,null);assert.equal(gpsReads,0);
  value.setUserOrigin(52.15,11.64,'Typed address');const selected=h.render(provider,{}).props.value;
  assert.equal(selected.userOrigin.kind,'manual');assert.equal(selected.userOrigin.name,'Typed address');h.unmount();
});

test('an explicitly saved manual origin survives reload without becoming live GPS',async()=>{
  const h=host();const storage=new Map([['@perix_user_origin',JSON.stringify({
    latitude:52.1205,longitude:11.6276,name:'Entered address',kind:'manual',savedAt:Date.now(),
  })]]);
  const provider=load('context/LocationContext.tsx',{react:h.react,'react-native':rn,
    '@react-native-async-storage/async-storage':{default:{getItem:async()=>null}},
    './AuthContext':{useAuth:()=>({sessionToken:null})},'../lib/locationPermission':{},
  },{window:{localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}}}).LocationProvider;
  h.render(provider,{});await flush();const v=h.render(provider,{}).props.value;
  assert.equal(v.userOrigin.kind,'manual');assert.equal(v.userOrigin.name,'Entered address');
  assert.equal(v.livePosition,null);
  v.setUserOrigin(52.13,11.64,'New address');
  assert.equal(JSON.parse(storage.get('@perix_user_origin')).name,'New address');
  h.unmount();
});

test('a late GPS answer cannot overwrite a more recently entered user origin',async()=>{
  const h=host();let finish;
  const provider=load('context/LocationContext.tsx',{react:h.react,'react-native':rn,
    '@react-native-async-storage/async-storage':{default:{getItem:async()=>null}},'./AuthContext':{useAuth:()=>({sessionToken:null})},
    '../lib/locationPermission':{getCurrentPositionWithPermission:()=>new Promise(resolve=>{finish=resolve;}),isReliablePosition:()=>true},
  }).LocationProvider;
  let value=h.render(provider,{}).props.value;
  const pending=value.useLiveLocation();value.setUserOrigin(52.15,11.64,'Typed address');
  finish({latitude:52.14,longitude:11.63,accuracy:10});assert.equal(await pending,null);
  value=h.render(provider,{}).props.value;assert.equal(value.userOrigin.kind,'manual');assert.equal(value.userOrigin.latitude,52.15);
  assert.equal(value.livePosition,null);assert.equal(value.loading,false);h.unmount();
});

test('actual stop card keeps last known clocks through a failed read, reaches zero and retires only that tram', async () => {
  const h=host(),clock=load('lib/city/serverClock.ts');
  let time=1000,tick,poller,fail=false,refreshes=0;
  const rows=[60,120].map((seconds,index)=>({vehicle_id:`tram-${index}`,mode:'tram',route_number:String(index+1),
    route_direction:'South',countdown_event:'DEPARTURE',countdown_target_at_ms:100000+seconds*1000,
    display_countdown_seconds:seconds,countdown_deadline_monotonic_ms:1000+seconds*1000,client_received_monotonic_ms:1000}));
  const card=load('components/city/CityInlineDetails.tsx',{
    react:h.react,'react-native':rn,'../../lib/api/core':{},'../../lib/city/gateway':{},
     '../../lib/city/publicServices':{PUBLIC_SERVICE_THEME:{}},'./PublicServiceCard':{},
     'react-i18next':{useTranslation:()=>({t:(key,fallback)=>typeof fallback==='string'?fallback:key})},'../../i18n/city':{},
     '../../lib/city/departureBatch':departureBatchTools,
     '../../lib/api/mobility':{getBusesServing:async()=>{if(fail)throw Error('offline');return rows;}},
     '../../lib/city/arrivalVehicle':{vehicleForDeparture:()=>null},
    '../../lib/city/fleetPoller':{startFleetPolling:options=>{poller=options;options.load().then(options.publish);return()=>{};}},
    '../../lib/city/serverClock':clock,'../../lib/city/transitPublication':{requestVisualRefresh:()=>{refreshes++;}},
  },{setInterval:fn=>{tick=fn;return 1;},clearInterval(){},performance:{now:()=>time}}).default;
  const props={entity:{id:'stop:platform',type:'stop',title:'Stop'},bounds:{},onSelect(){}};
  const render=()=>h.render(card,props);
  const text=tree=>nodes(tree).filter(n=>n.type==='Text').map(n=>n.props.children.flat().join('')).join('\n');
  render();await flush();render();await flush();let tree=render();assert.match(text(tree),/Departure 1:00/);
  fail=true;await assert.rejects(poller.load());time=32000;tick();tree=render();
  assert.match(text(tree),/Departure 0:29/);assert.match(text(tree),/Last known timing/);
  time=61000;tick();tree=render();assert.match(text(tree),/Departure 0:00/);assert.match(text(tree),/Departure 1:00/);
  render();assert.equal(refreshes,1);
  time=67000;tick();tree=render();assert.doesNotMatch(text(tree),/Departure 0:00/);assert.match(text(tree),/Departure 0:54/);
  h.unmount();
});

test('native queue decoration releases a departed leader without retiming peers and cancels its single clock', () => {
  const h=host(),timers=new Map();let time=0,timerId=0;
  const queue=load('lib/city/stationQueue.ts'),pathGeometry=load('lib/city/transitPath.ts');
  const markers=[60,120,180].map((departure,index)=>({id:String(index),type:'tram',estimated:true,publicationStatus:'READY',
    path:[{latitude:52.14,longitude:11.63},{latitude:52.14,longitude:11.64}],motionPreview:{departure:departure*1000}}));
  const before=JSON.stringify(markers);
  const useQueue=load('hooks/city/useNativeStationQueue.ts',{react:h.react,
    '../../lib/city/transitPublication':{authorizePreview:preview=>preview,sampleAuthorizedPreview:(preview,now)=>({
      state:now<preview.departure?'VISUAL_STOP_ESTIMATE':'VISUAL_MOVING',progressM:100,expired:false,
      stationStopId:'platform',stationDepartureAtMs:preview.departure,stationArrivalAtMs:0})},
    '../../lib/city/transitPath':pathGeometry,'../../lib/city/stationQueue':queue,
  },{performance:{now:()=>time},Date,setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)}).useNativeStationQueue;
  const render=()=>h.render(()=>useQueue(markers,20,0));
  render();let offsets=render();assert.equal(offsets.get('1').rank,1);assert.equal(timers.size,1);
  const tick=()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  time=60000;tick();offsets=render();assert.equal(offsets.get('1').rank,0);
  for(let i=0;i<5;i++){time+=100;tick();render();}
  offsets=render();assert.ok(Math.hypot(offsets.get('1').x,offsets.get('1').y)<0.05);
  assert.equal(offsets.get('2').rank,1);assert.equal(JSON.stringify(markers),before);
  h.unmount();assert.equal(timers.size,0);
});

test('nearest places use real boarding platforms and a user origin, with a bounded radius and no catalogue mutation',()=>{
  const origin={latitude:52.14,longitude:11.63};
  const platformNear={...stops[0],stop_id:'near-platform',latitude:53,longitude:12,
    platforms:[{platform_id:'actual-platform',latitude:52.14001,longitude:11.63}]};
  const values=[stops[1],platformNear,stops[2]],before=JSON.stringify(values);
  const nearest=nearbyTools.nearestTransitStops(values,origin);
  assert.equal(nearest[0].stop,platformNear);assert.ok(nearest[0].distanceM<2);
  assert.equal(nearest[0].target.platform_id,'actual-platform');assert.equal(nearest[0].target.latitude,52.14001);
  assert.equal(nearest.length,2);assert.equal(JSON.stringify(values),before);
  assert.equal(nearbyTools.nearestTransitStops(values,null).length,0);
  assert.equal(nearbyTools.nearestTransitStops(values,{latitude:NaN,longitude:11.63}).length,0);
  assert.equal(nearbyTools.nearestTransitStops(values,{latitude:48,longitude:2}).length,0);
  assert.equal(nearbyTools.isCompactNearbyViewport({minLat:52.13,maxLat:52.15,minLng:11.62,maxLng:11.64}),true);
  assert.equal(nearbyTools.isCompactNearbyViewport({minLat:52,maxLat:52.3,minLng:11.5,maxLng:11.8}),false);
});
test('green incoming segment slices forward only on the validated route geometry',()=>{
  const points=[{latitude:0,longitude:0},{latitude:0,longitude:0.01},{latitude:0,longitude:0.02}];
  const cumulative=transitPathTools.visualPathCumulative(points),from=cumulative[0]+100,to=cumulative[2]-100;
  const segment=transitPathTools.sliceVisualPath(points,from,to);
  assert.equal(segment.length,3);assert.ok(segment[0].longitude>0);assert.ok(segment.at(-1).longitude<0.02);
  assert.equal(transitPathTools.sliceVisualPath(points,to,from).length,0);
  assert.equal(transitPathTools.sliceVisualPath(points,from,cumulative[2]+10).length,0);
});

function nearbyHost(supplied=false,extra={}){
  const h=host(),timers=new Map();let timerId=0,origin=null,live=null,catalogueReads=0,gpsReads=0;
  let catalogue=async()=>stops,search=async()=>({places:[{name:'My address',address:'My address, Magdeburg',lat:52.14,lng:11.63}]}),fix=async()=>null;
  const searchCalls=[],selectedOrigins=[];
  const panel=load('components/mobility/NearbyTransitSection.tsx',{
    react:h.react,'react-native':rn,'react-i18next':{useTranslation:()=>({t:(key,fallback,values={})=>typeof fallback==='string'
      ? fallback.replace(/\{\{(\w+)\}\}/g,(_,name)=>values[name] ?? ''):key})},
    '../../context/LocationContext':{useLocation:()=>({userOrigin:origin ?? (live?{...live,kind:'live'}:null),
      setUserOrigin:(latitude,longitude,name)=>{origin={latitude,longitude,name,kind:'manual'};},
      useLiveLocation:async()=>{gpsReads++;const result=await fix();if(result){live=result;origin=null;}return result;}})},
    '../../lib/api/mobility':{getTransitStops:async()=>{catalogueReads++;return catalogue();},searchPlaces:(...args)=>{searchCalls.push(args);return search(...args);}},
    '../../lib/city/nearbyTransit':nearbyTools,'./NearbyStopCard':{default:'StopCard'},'../city/TransitSourceNotice':{default:'Notice'},
    '../../lib/city/nearbyTransitCache':{prefetchNearbyCatalogue:()=>{}},
    '../../lib/city/visualGeometry':{transitStopPins},
    '@expo/vector-icons':{Ionicons:'Icon'},
  },{setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)}).default;
  let tree;const props={onOriginSelect:point=>selectedOrigins.push(point),...(supplied?{stops,stopsLoaded:true}:{}),...extra};
  return{render(){tree=h.render(panel,props);return tree;},all:()=>nodes(tree),cards:()=>nodes(tree).filter(n=>n.type==='StopCard').map(n=>n.props),
    origin:value=>{origin=value;},live:value=>{live=value;},search:fn=>{search=fn;},fix:fn=>{fix=fn;},catalogue:fn=>{catalogue=fn;},
    query:query=>nodes(tree).find(n=>n.props.testID==='nearby-transit-origin-input').props.onChangeText(query),
    timers(){const work=[...timers.values()];timers.clear();work.forEach(fn=>fn());},
    reads:()=>({catalogue:catalogueReads,gps:gpsReads}),searchCalls,selectedOrigins,props,unmount:h.unmount};
}
const textOf=tree=>nodes(tree).filter(n=>n.type==='Text').map(n=>n.props.children.flat().join('')).join('\n');

test('missing user location prompts for GPS or entered address without querying a guessed nearest stop',()=>{
  const p=nearbyHost();const tree=p.render();
  assert.match(textOf(tree),/Use your live location or enter your address/);
  assert.equal(p.cards().length,0);assert.deepEqual(p.reads(),{catalogue:0,gps:0});
  assert.ok(p.all().find(n=>n.props.testID==='nearby-transit-origin-input'));
});
test('explicit origin renders two closest cards immediately and supplied /app stops cause no second catalogue read',async()=>{
  const p=nearbyHost(true);p.origin({latitude:52.14,longitude:11.63,kind:'manual',name:'Entered address'});p.render();
  assert.deepEqual(p.cards().map(card=>card.stop.stop_id),['mixed','bus']);assert.equal(p.cards()[0].closest,true);
  assert.deepEqual(p.reads(),{catalogue:0,gps:0});
  p.origin({latitude:52.15,longitude:11.63,kind:'manual',name:'Other address'});p.render();assert.equal(p.cards()[0].stop.stop_id,'bus');
  assert.match(textOf(p.render()),/Entered location/);assert.doesNotMatch(textOf(p.render()),/Live location/);
});
test('the App nearby panel renders the three closest stops after a confirmed origin',()=>{
  const third={stop_id:'third',name:'Third stop',latitude:52.16,longitude:11.63,modes:['bus'],routes:[]};
  const p=nearbyHost(true,{stopLimit:3,stops:[...stops,third]});
  p.origin({latitude:52.14,longitude:11.63,kind:'manual',name:'Confirmed address'});p.render();
  assert.deepEqual(p.cards().map(card=>card.stop.stop_id),['mixed','bus','third']);
  assert.deepEqual(p.reads(),{catalogue:0,gps:0});
});

test('selected station neighbours render five distinct cards and never repeat the primary station',()=>{
  const fixture=Array.from({length:6},(_,i)=>({stop_id:'s'+i,name:'Station '+i,latitude:52.14+i*.0001,longitude:11.63,
    platform_id:'p'+i,modes:['tram'],routes:[]}));
  const p=nearbyHost(true,{stops:fixture,stopLimit:5,excludeStopId:'s2',radiusM:3000,
    originOverride:{latitude:fixture[2].latitude,longitude:fixture[2].longitude,kind:'manual'}});
  p.render();assert.equal(p.cards().length,5);
  assert.equal(p.cards().some(card=>card.stop.stop_id==='s2'),false);
  assert.equal(new Set(p.cards().map(card=>card.stop.stop_id)).size,5);
  assert.deepEqual(p.reads(),{catalogue:0,gps:0});p.unmount();
});

test('collapsible nearby section mounts no departure cards until the blue arrow is pressed and does not refetch on toggles',()=>{
  const p=nearbyHost(true,{collapsible:true,hideWhenEmpty:true,bounds:{minLat:52.1,maxLat:52.2,minLng:11.6,maxLng:11.7}});
  p.origin({latitude:52.14,longitude:11.63,kind:'manual'});p.render();
  assert.equal(p.cards().length,0);
  const toggle=()=>p.all().find(n=>n.props.testID==='nearby-transit-toggle');
  assert.equal(toggle().props.accessibilityState.expanded,false);
  assert.equal(nodes(toggle()).find(n=>n.type==='Icon').props.color,'#59ABE3');
  toggle().props.onPress();p.render();assert.equal(p.cards().length,2);
  toggle().props.onPress();p.render();assert.equal(p.cards().length,0);
  assert.deepEqual(p.reads(),{catalogue:0,gps:0});
});
test('known empty map bounds hide the entire nearby section; actual boarding-platform coverage is used',()=>{
  const p=nearbyHost(true,{collapsible:true,hideWhenEmpty:true,bounds:{minLat:48,maxLat:49,minLng:2,maxLng:3}});
  assert.equal(p.render(),null);
  p.props.bounds={minLat:52.139,maxLat:52.141,minLng:11.629,maxLng:11.631};p.render();
  assert.ok(p.all().find(n=>n.props.testID==='nearby-transit-toggle'));
  p.props.stopsError=true;p.props.stopsLoaded=false;p.render();
  assert.ok(p.all().find(n=>n.props.testID==='nearby-transit-toggle'),'failed reads are not a confirmed empty map');
});
test('popup-only origin editor reuses existing address/GPS actions without mounting nearby cards or another catalogue reader',async()=>{
  const p=nearbyHost(true,{originEditorOnly:true,stops:[]});p.origin({latitude:52.14,longitude:11.63,kind:'manual'});
  p.render();assert.ok(p.all().find(n=>n.props.testID==='map-origin-editor'));
  assert.ok(p.all().find(n=>n.props.testID==='nearby-transit-origin-input'));assert.equal(p.cards().length,0);
  p.query('My address');p.render();p.timers();await flush();p.render();
  p.all().find(n=>n.type==='Pressable'&&textOf(n)==='My address, Magdeburg').props.onPress();p.render();
  assert.equal(p.selectedOrigins[0].name,'My address, Magdeburg');assert.deepEqual(p.reads(),{catalogue:0,gps:0});
});

test('App root exposes only Public Services/results while moving transit vehicles remain on the map',async()=>{
  const g=gatewayHost();g.rows([{id:'shop',type:'business',title:'Shop',latitude:52.14,longitude:11.63},
    {id:'public-one',type:'public_service',title:'Public office',latitude:52.14,longitude:11.63}]);
  await readyAtOrigin(g);
  const categoryGrid=g.all().find(n=>n.props.testID==='city-category-grid');
  const categoryLabels=nodes(categoryGrid).filter(n=>n.type==='Pressable').map(n=>n.props.accessibilityLabel);
  assert.equal(categoryLabels[0],'Public Services');assert.ok(categoryLabels.includes('Businesses'),'other categories remain selectable');
  assert.deepEqual(g.all().filter(n=>n.type==='ResultCard').map(n=>n.props.entity.type),['public_service']);
  assert.equal(g.all().find(n=>n.type==='NearbyTransit').props.collapsible,true);
  assert.equal(g.all().filter(n=>n.props.testID?.startsWith('nearby-stop-')).length,0);
  g.all().find(n=>n.props.accessibilityLabel==='Public Services').props.onPress();g.render();
  assert.equal(g.all().find(n=>n.props.testID==='city-nearby-tracking-panel').props.style.display,'none');
  assert.ok(g.map().markers.some(m=>m.type==='tram'));assert.deepEqual(g.all().filter(n=>n.type==='ResultCard').map(n=>n.props.entity.type),['public_service']);
  assert.deepEqual(g.reads(),[1,1]);
});
test('address destinations keep the compass flow while public result cards open their full page directly',async()=>{
  const g=gatewayHost();await readyAtOrigin(g);await chooseSearchResult(g);
  let all=g.all();assert.ok(all.indexOf(all.find(n=>n.props.testID==='city-map-info-toggle'))>all.indexOf(all.find(n=>n.type==='Map')));
  assert.ok(all.indexOf(all.find(n=>n.props.testID==='city-destination'))>all.indexOf(all.find(n=>n.props.testID==='city-map-info-toggle')));
  assert.equal(g.map().markers.find(m=>m.id==='gateway-destination').selectionCompass,true);
  assert.equal(g.all().find(n=>n.type==='TextInput' && n.props.placeholder==='Where do you want to go?').props.value,'');
  assert.equal(g.all().find(n=>n.props.testID==='city-nearby-tracking-panel').props.style.display,'none');
  g.all().find(n=>n.props.testID==='city-close-destination').props.onPress();g.render();assert.equal(g.directions(),undefined);
  assert.equal(g.map().markers.some(m=>m.selectionCompass),false);
  g.rows([{id:'office',type:'public_service',title:'Public office',latitude:52.14,longitude:11.63}]);g.render();
  g.all().find(n=>n.type==='ResultCard').props.onPress();g.render();
  assert.equal(g.routeCalls.length,1);
  assert.equal(g.routeCalls[0].pathname,'/public-services/[id]');
  assert.equal(g.routeCalls[0].params.id,'office');
  assert.equal(g.all().find(n=>n.type==='GooglePreview'),undefined);
  assert.ok(g.directoryCalls.every(args=>args[2]===''),'address query is not a directory filter');
  assert.equal(g.map().markers.some(m=>m.id==='gateway-destination'),false);
  g.unmount();
});
test('selecting a directory pin shows its result above route preview, retains its profile pin and freezes discovery bounds',async()=>{
  const g=gatewayHost();await readyAtOrigin(g);
  const service={service_id:'ps_office',source_record_id:'perix_md_001',profile_image_asset:'profiles/perix_md_001_profile.webp'};
  g.rows([{id:'ps_office',type:'public_service',title:'Public office',latitude:52.14,longitude:11.63,publicService:service}]);g.render();
  const pin=g.map().markers.find(m=>m.id==='public_service:ps_office');
  assert.equal(pin.pinImage,'/profile.webp');assert.equal(pin.pinImageFit,'contain');
  const original=JSON.stringify(g.directoryCalls.at(-1)[1]),reads=g.reads();
  g.map().onMarkerPress(pin.id);g.render();
  const result=g.all().find(n=>n.props.testID==='city-selected-result');
  assert.equal(nodes(result).find(n=>n.type==='ResultCard').props.entity.publicService,service);
  assert.ok(g.all().indexOf(result)<g.all().indexOf(g.all().find(n=>n.type==='GooglePreview')));
  assert.equal(g.all().find(n=>n.type==='Details'),undefined,'summary reuses the main map instead of mounting full details');
  const selectedPin=g.map().markers.find(m=>m.id==='public_service:ps_office');
  assert.equal(selectedPin.pinImage,'/profile.webp');assert.equal(!!selectedPin.selectionCompass,false);
  assert.equal(g.map().markers.some(m=>m.id==='gateway-destination'),false,'selection preserves the address group instead of adding a duplicate pin');
  nodes(result).find(n=>n.type==='ResultCard').props.onPress();g.render();
  assert.equal(g.routeCalls.at(-1).params.id,service.service_id);
  assert.equal(g.all().find(n=>n.type==='GooglePreview').props.destination.title,'Public office');
  for(let i=0;i<5;i++){
    g.map().onRegionChangeComplete({minLat:52.12-i*.001,maxLat:52.16+i*.001,minLng:11.60,maxLng:11.66});g.render();
    assert.equal(JSON.stringify(g.directoryCalls.at(-1)[1]),original,'selected place does not change the directory request key');
  }
  assert.deepEqual(g.reads(),reads,'inspection never resets the stop/fleet scope');
  g.all().find(n=>n.props.testID==='city-close-destination').props.onPress();g.render();
  assert.equal(JSON.stringify(g.directoryCalls.at(-1)[1]),original,'closing keeps the same loaded area rather than querying the camera again');
  assert.equal(g.all().find(n=>n.type==='Details'),undefined);
  g.unmount();
});
test('category drilldown mutes buildings and hides arrival UI, and back restores the original map scene',async()=>{
  const g=gatewayHost();await readyAtOrigin(g);
  assert.equal(g.map().landmarksMuted,false);
  const catalogue=g.map().landmarks,stops=g.map().transitStops,reads=g.reads();
  g.all().find(n=>n.props.testID==='city-category-button-public-services').props.onPress();g.render();
  assert.equal(g.map().landmarksMuted,true);
  assert.equal(g.map().landmarks,catalogue,'background treatment cannot remove or change buildings');
  assert.equal(g.map().transitStops,stops);
  assert.equal(g.all().find(n=>n.props.testID==='city-nearby-tracking-panel').props.style.display,'none');
  assert.equal(g.all().find(n=>n.props.testID==='city-nearby-loading'),undefined);
  assert.equal(g.all().find(n=>n.props.testID==='city-no-nearby-stops'),undefined);
  g.all().find(n=>n.props.accessibilityLabel==='ui.all').props.onPress();g.render();
  assert.equal(g.map().landmarksMuted,false);
  assert.equal(g.all().find(n=>n.props.testID==='city-nearby-tracking-panel').props.style,undefined);
  assert.deepEqual(g.reads(),reads,'visual category focus does not refetch the mobility scope');
  g.unmount();
});
test('selecting another entry at the same address keeps list order, first profile and original grouping inputs',async()=>{
  const g=gatewayHost();await readyAtOrigin(g);
  const address='Breiter Weg 203–206, 39104 Magdeburg';
  g.rows([{id:'first',type:'public_service',title:'First office',address,latitude:52.13,longitude:11.63,
    publicService:{service_id:'first',profile_image_url:'/first.webp'}},
    {id:'second',type:'public_service',title:'Second office',address,latitude:52.1301,longitude:11.6301,
      publicService:{service_id:'second',profile_image_url:'/second.webp'}}]);g.render();
  const pins=()=>g.map().markers.filter(row=>row.id.startsWith('public_service:'));
  const before=JSON.stringify(pins());
  assert.equal(pins()[0].pinImage,'/first.webp');assert.equal(pins()[0].address,address);
  g.map().onMarkerPress('public_service:second');g.render();
  assert.equal(JSON.stringify(pins()),before,'inspection cannot reorder the representative or split a counted address pin');
  assert.equal(g.all().find(n=>n.type==='GooglePreview').props.destination.title,'Second office');
  g.unmount();
});
test('selected stop replaces the one-station result with a fresh scoped sequence, then close restores the user origin',async()=>{
  const g=gatewayHost();await readyAtOrigin(g);
  const marker=g.map().transitStops.find(stop=>stop.stop_id==='bus');assert.ok(marker);
  g.map().onTransitStopPress(marker);g.render();
  assert.ok(g.all().find(n=>n.props.testID==='city-selected-stop-programme'));
  assert.equal(g.all().find(n=>n.type==='NearbyTransit').props.excludeStopId,'bus','selected station owns the first board, not a duplicate neighbour card');
  assert.equal(g.all().find(n=>n.type==='Details').props.entity.title,marker.name);
  for(let i=0;i<6;i++){g.timers();await flush();g.render();}
  const selectedOrigin=g.nearbyCalls.at(-1).origin;
  assert.deepEqual([selectedOrigin.latitude,selectedOrigin.longitude],[marker.latitude,marker.longitude]);
  assert.equal(g.nearbyCalls.at(-1).options.limit,6);assert.equal(g.nearbyCalls.at(-1).options.radiusM,3000);
  assert.ok(g.requestOrder.lastIndexOf('nearby-stops')<g.requestOrder.lastIndexOf('nearby-map'));
  g.arrivalUpdate(g.arrivalRows(),2);g.render();
  for(let i=0;i<3;i++){g.timers();await flush();g.render();}
  assert.ok(g.requestOrder.lastIndexOf('nearby-map')<g.requestOrder.lastIndexOf('nearby-vehicles'));
  g.all().find(n=>n.props.testID==='city-close-stop-programme').props.onPress();g.render();
  assert.equal(g.all().find(n=>n.props.testID==='city-selected-stop-programme'),undefined);
  for(let i=0;i<6;i++){g.timers();await flush();g.render();}
  const restored=g.all().find(n=>n.type==='NearbyTransit');assert.equal(restored.props.collapsible,true);
  assert.equal(restored.props.radiusM,150);assert.equal(restored.props.stopLimit,5);
});

test('result cards share actual Locator layout; selection compass is a local original-artwork crop on both renderers',()=>{
  const card=read('components/city/GatewayResultCard.tsx');
  assert.match(card,/locatorCardStyles as styles/);assert.match(card,/style=\{styles.cardRow\}/);
  assert.doesNotMatch(card,/isOpen|duration|distance|fetch\(/);
  for(const file of ['components/BusinessMap.web.tsx','components/BusinessMap.native.tsx']) {
    const source=read(file);assert.match(source,/selectionCompass/);assert.match(source,/perix-compass-transparent\.png/);
    assert.match(source,/mapMarkerGroupKey\(m\)/);
  }
  const png=fs.readFileSync(path.join(__dirname,'../assets/brand/perix-compass.png'));
  assert.equal(png.readUInt32BE(16),168);assert.equal(png.readUInt32BE(20),168);
  assert.match(card,/entity\.type==="public_service"&&\{color:"#59ABE3"\}/);
});
test('App root shows only current public-service records; parks/squares/sport live only in the hidden locations branch',async()=>{
  const g=gatewayHost();g.rows([{id:'civic',type:'public_service',title:'Verified office'},{id:'shop',type:'business',title:'Shop'}]);
  await readyAtOrigin(g);
  assert.deepEqual(g.all().filter(n=>n.type==='ResultCard').map(n=>n.props.entity.type),['public_service']);
  assert.equal(g.directoryCalls.at(-1)[0].publicOnly,true);
  const taxonomy=JSON.parse(read('../backend/public_services/taxonomy.json'));
  const visible=(taxonomy.children||[]).filter(n=>!n.hidden && !String(n.id).startsWith('ps:'));
  const visibleText=JSON.stringify(visible);
  assert.doesNotMatch(visibleText,/parks|squares|open.?air.?sport/i);
  const hidden=(taxonomy.children||[]).find(n=>n.id==='locations');
  assert.ok(hidden && hidden.hidden===true,'locations branch exists and stays hidden from /app tiles');
  assert.match(JSON.stringify(hidden),/parks|squares/i);
});
test('app/login white backgrounds are scoped and RootLayout obtains its own pathname hook',()=>{
  assert.match(read('app/_layout.tsx'),/function RootLayout\(\) \{\s*const pathname = usePathname\(\)/);
  assert.match(read('app/_layout.tsx'),/\["\/", "\/app", "\/login"\]\.includes\(pathname\)/);
  const login=read('app/(auth)/login.tsx');assert.doesNotMatch(login,/backgroundColor: COLORS.backgroundPage/);
  assert.match(login,/testID="perix-login-scroll"/);
});
test('Home loads the existing stop catalogue only after a live fix, and moving GPS does not reload the catalogue',async()=>{
  const p=nearbyHost();p.render();p.fix(async()=>({latitude:52.14,longitude:11.63}));
  await p.all().find(n=>n.props.testID==='nearby-transit-locate').props.onPress();p.render();await flush();p.render();
  assert.equal(p.cards()[0].stop.stop_id,'mixed');assert.deepEqual(p.reads(),{catalogue:1,gps:1});
  p.live({latitude:52.15,longitude:11.63});p.render();assert.equal(p.cards()[0].stop.stop_id,'bus');
  assert.deepEqual(p.reads(),{catalogue:1,gps:1});
});
test('manual address search works without a session and cancelled old results cannot replace a newer address',async()=>{
  const p=nearbyHost(true);let resolveOld;
  p.search((_,query)=>query==='old'?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve({places:[{name:'New address',lat:52.14,lng:11.63}]}));
  p.render();p.query('old');p.render();p.timers();
  p.query('new');p.render();p.timers();await flush();p.render();
  resolveOld({places:[{name:'Old address',lat:53,lng:12}]});await flush();let tree=p.render();
  assert.match(textOf(tree),/New address/);assert.doesNotMatch(textOf(tree),/Old address/);
  p.all().find(n=>n.type==='Pressable' && textOf(n)==='New address').props.onPress();tree=p.render();
  assert.equal(p.cards()[0].stop.stop_id,'mixed');assert.match(textOf(tree),/Entered location/);
  assert.equal(p.searchCalls[0][0],null);assert.deepEqual(p.reads(),{catalogue:0,gps:0});
});
test('GPS denial leaves manual entry usable; a catalogue failure is retryable rather than a false no-stops result',async()=>{
  const p=nearbyHost();p.render();await p.all().find(n=>n.props.testID==='nearby-transit-locate').props.onPress();
  let tree=p.render();assert.match(textOf(tree),/home.locateFailed/);assert.equal(p.cards().length,0);
  p.origin({latitude:52.14,longitude:11.63,kind:'manual'});p.catalogue(async()=>{throw Error('offline');});
  p.render();await flush();tree=p.render();assert.match(textOf(tree),/ui.unavailable/);assert.doesNotMatch(textOf(tree),/No stops within/);
  p.catalogue(async()=>stops);p.all().find(n=>n.type==='Pressable' && textOf(n).includes('ui.retry')).props.onPress();
  p.render();await flush();p.render();assert.equal(p.cards()[0].stop.stop_id,'mixed');
});
test('explicit manual origins, unlike camera movement, are valid planner origins and changing them replans',async()=>{
  const g=gatewayHost();g.origin({latitude:52.14,longitude:11.63,kind:'manual',name:'Entered address'});
  g.planner(async()=>({itineraries:[itinerary]}));await readyAtOrigin(g,null);await chooseSearchResult(g,0,'Destination',true);await flush();g.render();
  assert.deepEqual(Array.from(g.planCalls[0]).slice(1,3),[52.14,11.63]);assert.equal(g.directions().journey.origin.kind,'manual');
  g.origin({latitude:52.15,longitude:11.64,kind:'manual'});g.render();await flush();g.render();
  assert.deepEqual(Array.from(g.planCalls[1]).slice(1,3),[52.15,11.64]);
  assert.ok(g.map().markers.find(n=>n.id==='gateway-user-origin'));assert.equal(g.map().pinLocation,null);
});
test('Home/Locator do not render nearby stop lists; App keeps its collapsed section only at the root',()=>{
  const gateway=fs.readFileSync(path.join(__dirname,'..','components/city/CityGatewayScreen.tsx'),'utf8');
  const home=fs.readFileSync(path.join(__dirname,'..','app/(tabs)/home.tsx'),'utf8');
  assert.match(gateway,/<NearbyTransitSection collapsible initialExpanded hideWhenEmpty/);
  assert.match(gateway,/testID="city-origin-gate"/);
  assert.match(gateway,/getNearbyMap\(null,queryOrigin,nearbyQueryBounds/);
  assert.match(gateway,/getNearbyVehicles\(null, queryOrigin, nearbyQueryBounds, initialSync, nearbyVehicleIds,\{limit:5,lifetime:true\}\)/);
  assert.match(gateway,/radiusM:nearbyScopeRadiusM/);
  assert.doesNotMatch(gateway,/nearbyViewportKey/);
  assert.doesNotMatch(gateway,/getV2Map\(null/);
  assert.doesNotMatch(home,/<NearbyTransitSection/);
  assert.match(gateway,/onTransitStopPress/);
  const mapSection=fs.readFileSync(path.join(__dirname,'..','components/home/MapSection.tsx'),'utf8');
  assert.doesNotMatch(mapSection,/getCurrentPositionWithPermission/);
  const locator=read('components/locator/LegacyLocatorScreen.tsx');
  assert.doesNotMatch(locator,/locator-nearby-stops-toggle/);
  assert.doesNotMatch(locator,/nearbyStops\.map/);
  assert.match(locator,/locator-selected-stop-programme/);
});

test('compact nearby section keeps only two stop cards and preserves an accessible location editor',async()=>{
  const p=nearbyHost();p.origin({latitude:52.14,longitude:11.63,kind:'manual',name:'Address'});
  p.catalogue(async()=>[...stops,{...stops[1],stop_id:'third-near',latitude:52.145}]);
  p.render();await flush();p.render();assert.equal(p.cards().length,2);
  assert.equal(p.all().find(n=>n.props.testID==='nearby-transit-origin-input'),undefined);
  p.all().find(n=>n.props.testID==='nearby-transit-edit-origin').props.onPress();p.render();
  assert.ok(p.all().find(n=>n.props.testID==='nearby-transit-origin-input'));
  assert.deepEqual(p.reads(),{catalogue:1,gps:0});
});

function compactBoardHost(){
  const h=host(),clock=load('lib/city/serverClock.ts');let calls=0,poller,tick,time=1000;
  const countdown=clock.countdownPresentation;
  const rows=Array.from({length:9},(_,index)=>({vehicle_id:`tram-${index}`,trip_id:`trip-${index}`,trip_instance_id:`instance-${index}`,
    network_version_id:'test-network',service_date:'2026-11-06',platform_id:'platform-A',mode:'tram',route_number:String(index+1),route_direction:'South',
    countdown_event:'DEPARTURE',countdown_target_at_ms:100000+(index+1)*60000,
    display_countdown_seconds:(index+1)*60,countdown_deadline_monotonic_ms:1000+(index+1)*60000,client_received_monotonic_ms:1000}));
  const component=load('components/city/CityInlineDetails.tsx',{react:h.react,'react-native':rn,'@expo/vector-icons':{Ionicons:'Icon'},
    '../../lib/api/core':{},'../../lib/city/gateway':{},'../../lib/city/publicServices':{PUBLIC_SERVICE_THEME:{}},'./PublicServiceCard':{},
    'react-i18next':{useTranslation:()=>({t:(key,fallback)=>typeof fallback==='string'?fallback:key})},'../../i18n/city':{},
      '../../lib/api/mobility':{getBusesServing:async(...args)=>{calls++;const page=args[5];return page?rows.slice(page.offset,page.offset+page.limit):rows;}},
     '../../lib/city/arrivalVehicle':{vehicleForDeparture:()=>null},
    '../../lib/city/fleetPoller':{startFleetPolling:options=>{poller=options;options.load().then(options.publish);return()=>{};}},
     '../../lib/city/serverClock':clock,'../../lib/city/transitPublication':{requestVisualRefresh(){}},
     '../../lib/city/departureBatch':departureBatchTools,
  },{setInterval:fn=>{tick=fn;return 1;},clearInterval(){},performance:{now:()=>time}}).default;
  const arrivals=[];
  const props={entity:{id:'stop:one',type:'stop',title:'Stop one'},bounds:{},onSelect(){},compactStopBoard:true,initialDepartureLimit:3,onArrivalsUpdate:(key,rows,count)=>arrivals.push({key,rows,count})};
  let tree;return{render(){tree=h.render(component,props);return tree;},all:()=>nodes(tree),calls:()=>calls,
    toggle:()=>nodes(tree).find(n=>n.props.testID==='compact-departures-toggle'),
    rows:()=>nodes(tree).filter(n=>n.props.testID==='compact-departure-row'),
    refresh:()=>poller.publish(rows),tick:value=>{time=value;tick();},forceVisible:()=>{clock.countdownPresentation=(row,now)=>({...countdown(row,now),visible:true});},
    props,arrivals,rawRows:rows,unmount:h.unmount};
}
test('compact departure board shows three, expands/collapses with a chevron, and never fetches for that toggle',async()=>{
  const b=compactBoardHost();b.render();await flush();b.render();await flush();b.render();assert.equal(b.rows().length,3);assert.equal(b.calls(),1);
  assert.equal(b.toggle().props.accessibilityState.expanded,false);
  assert.ok(nodes(b.toggle()).find(n=>n.type==='Icon' && n.props.name==='chevron-down'));
  b.toggle().props.onPress();b.render();assert.equal(b.rows().length,9);assert.equal(b.calls(),1);
  b.refresh();b.render();assert.equal(b.rows().length,9);
  b.toggle().props.onPress();b.render();assert.equal(b.rows().length,3);assert.equal(b.calls(),1);
  b.tick(67000);b.render();assert.equal(b.rows().length,3);assert.match(textOf(b.rows()[0]),/2/);
  assert.ok(nodes(b.toggle()).find(n=>n.type==='Icon' && n.props.name==='chevron-down'));
  b.unmount();
});
test('changing stop/platform resets a compact board to three while ordinary refreshes preserve expansion',async()=>{
  const b=compactBoardHost();b.render();await flush();b.render();await flush();b.render();b.toggle().props.onPress();b.render();assert.equal(b.rows().length,9);
  b.props.entity={id:'stop:two',type:'stop',title:'Stop two',facts:{platform_id:'other-platform'}};
  b.render();await flush();b.render();await flush();b.render();assert.equal(b.rows().length,3);assert.equal(b.calls(),2);
  assert.equal(b.toggle().props.accessibilityState.expanded,false);b.unmount();
});
test('expanding one stop card does not expand the other stop or trigger another arrivals read',async()=>{
  const first=compactBoardHost(),second=compactBoardHost();
  first.render();second.render();await flush();first.render();second.render();await flush();first.render();second.render();
  first.toggle().props.onPress();first.render();second.render();
  assert.equal(first.rows().length,9);assert.equal(second.rows().length,3);
  assert.equal(first.calls(),1);assert.equal(second.calls(),1);first.unmount();second.unmount();
});
test('App departure batches reveal two rows, wait for their exact-vehicle batch, then reveal two more',async()=>{
  const b=compactBoardHost();b.props.progressiveDepartures=true;b.props.initialDepartureLimit=2;b.props.fleetBatchLoadedKey="";
  b.forceVisible();
  b.render();await flush();b.render();await flush();b.render();assert.equal(b.rows().length,2);
  assert.equal(b.arrivals.at(-1).rows.length,2);
  const firstTwo=departureBatchTools.departureBatchKey(b.rawRows.slice(0,2));
  b.props.fleetBatchLoadedKey=firstTwo;b.render();await flush();b.render();await flush();b.render();
  assert.equal(b.rows().length,4);assert.equal(b.arrivals.at(-1).rows.length,4);
  const firstFour=departureBatchTools.departureBatchKey(b.rawRows.slice(0,4));
  b.props.fleetBatchLoadedKey=firstFour;b.render();await flush();b.render();await flush();b.render();
  assert.equal(b.rows().length,6);assert.equal(b.arrivals.at(-1).rows.length,6);
  const firstSix=departureBatchTools.departureBatchKey(b.rawRows.slice(0,6));
  b.props.fleetBatchLoadedKey=firstSix;b.render();await flush();b.render();await flush();b.render();
  assert.equal(b.rows().length,8);assert.equal(b.arrivals.at(-1).rows.length,8);
  assert.equal(b.calls(),4,'each automatic departure batch requests only its next two rows');b.unmount();
});

function stopCardHost(external){
  const h=host(),planned=[],directions=[],props={stop:stops[0],distanceM:12,target:{latitude:52.14001,longitude:11.63001},
    origin:{latitude:52.14,longitude:11.63,kind:'manual'},closest:true};
  const externalJourney={status:'ready',plan:itinerary,retry(){}};
  if(external){props.onDirections=stop=>directions.push(stop);props.activeJourney={destinationId:undefined,journey:externalJourney};}
  const component=load('components/mobility/NearbyStopCard.tsx',{react:h.react,'react-native':rn,'@expo/vector-icons':{Ionicons:'Icon'},
    'react-i18next':{useTranslation:()=>({t:(key,fallback)=>fallback || key})},
    '../../hooks/city/useGatewayJourney':{useGatewayJourney:(destination,origin)=>{planned.push({destination,origin});return{status:destination?'ready':'idle',plan:itinerary,retry(){}};}},
    '../city/CityInlineDetails':{default:'StopBoard'},'./JourneyDirectionsCard':{default:'JourneyDirections'},
  }).default;
  let tree;return{props,planned,directions,externalJourney,render(){tree=h.render(component,props);return tree;},all:()=>nodes(tree),
    button:()=>nodes(tree).find(n=>n.props.testID==='nearby-directions-mixed')};
}
test('Home card keeps Directions and its three-departure board together, planning only when Directions is opened',()=>{
  const c=stopCardHost(false);c.render();assert.equal(c.planned[0].destination,null);
  const board=c.all().find(n=>n.type==='StopBoard').props;assert.equal(board.initialDepartureLimit,3);assert.equal(board.compactStopBoard,true);
  c.button().props.onPress();const tree=c.render();
  assert.equal(c.planned.at(-1).destination.latitude,52.14001);
  assert.equal(c.planned.at(-1).origin.kind,'manual');assert.ok(c.all().find(n=>n.type==='JourneyDirections'));
  assert.equal(tree.props.testID,'nearby-stop-mixed');
  c.button().props.onPress();c.render();assert.equal(c.planned.at(-1).destination,null);
});
test('/app compact card reuses the parent route without starting another planner and follows the selected card',()=>{
  const c=stopCardHost(true);c.render();c.button().props.onPress();
  assert.equal(c.directions.length,1);assert.equal(c.directions[0].latitude,52.14001);
  c.props.activeJourney.destinationId='stopplace:mixed';c.render();
  assert.equal(c.all().find(n=>n.type==='JourneyDirections').props.journey,c.externalJourney);
  assert.ok(c.planned.every(call=>call.destination===null));
  c.props.activeJourney.destinationId='stopplace:other';c.render();assert.equal(c.button().props.accessibilityState.expanded,false);
  c.button().props.onPress();assert.equal(c.directions.length,2);
});
test('map stop tap opens one selected timetable without a duplicate nearby card',async()=>{
  const g=gatewayHost();await readyAtOrigin(g);
  g.map().onTransitStopPress({...stops[0],platform_id:'tram-platform'});g.render();
  assert.equal(g.all().find(n=>n.type==='NearbyTransit').props.excludeStopId,'mixed');
  assert.ok(g.all().find(n=>n.props.testID==='city-selected-stop-programme'));
  assert.equal(g.map().planLines.length,0);
  g.all().find(n=>n.props.testID==='city-close-stop-programme').props.onPress();g.render();
  assert.equal(g.all().find(n=>n.props.testID==='city-selected-stop-programme'),undefined);
});

test('desktop header keeps App/Members and no longer renders Explore',()=>{
  const h=host(),routes=[];let user=null,pathname='/app',loading=false;
  const component=load('components/city/MapScreenHeader.tsx',{react:h.react,'react-native':{...rn,useWindowDimensions:()=>({width:1280,height:800})},
    'expo-router':{useRouter:()=>({navigate:route=>routes.push(route)}),usePathname:()=>pathname},
    'react-i18next':{useTranslation:()=>({t:(key,fallback)=>fallback || key})},'../../context/AuthContext':{useAuth:()=>({user,loading})},
    '../brand/PerixLogo':{default:'Logo'},'./FontMagnifierButton':{default:'Magnifier'},
    '@expo/vector-icons':{Ionicons:'Icon'},'./MapBaseSelector':{default:'BaseSelector'},
    '../../lib/city/mapLayout':layoutTools,
  }).default;
  let tree=h.render(component,{publicScreen:true});let nav=nodes(tree).find(n=>n.props.testID==='map-screen-navigation');
  assert.deepEqual(nodes(nav).filter(n=>n.type==='Pressable').map(n=>n.props.testID),['map-nav-app','map-nav-members']);
  nodes(nav).find(n=>n.props.testID==='map-nav-members').props.onPress();assert.equal(routes.at(-1),'/login');
  loading=true;tree=h.render(component,{publicScreen:true});assert.equal(nodes(tree).find(n=>n.props.testID==='map-nav-members').props.disabled,true);
  loading=false;user={name:'Alex'};tree=h.render(component,{publicScreen:true});nodes(tree).find(n=>n.props.testID==='map-nav-members').props.onPress();assert.equal(routes.at(-1),'/home');
   pathname='/locator';tree=h.render(component,{exploreOnly:true});nav=nodes(tree).find(n=>n.props.testID==='map-screen-navigation');
    assert.deepEqual(nodes(nav).filter(n=>n.type==='Pressable').map(n=>n.props.testID),['map-nav-app','map-nav-members']);
    assert.equal(nodes(nav).find(n=>n.props.testID==='map-nav-explore'),undefined);
   assert.equal(tree.props.children[0].props.children[1],nav);assert.ok(nodes(tree).find(n=>n.type==='Logo'));assert.equal(nodes(tree).find(n=>n.type==='BaseSelector'),undefined);
});
test('desktop shared header retains create/message actions and uses the avatar identity switcher on profile routes',()=>{
  const h=host();let creates=0,navigated=null;
  const component=load('components/TopNavbar.tsx',{react:h.react,'react-native':{...rn,Platform:{OS:'web',select:values=>values.web}},'expo-router':{useRouter:()=>({navigate(route){navigated=route},push(){}}),usePathname:()=>'/profile'},
     '@expo/vector-icons':{Ionicons:'Icon'},'react-i18next':{useTranslation:()=>({t:(key,fallback)=>fallback || key})},
     '../context/AuthContext':{useAuth:()=>({sessionToken:'token',setActiveIdentity(){}})},'../context/BadgeContext':{useBadge:()=>({unreadMessageCount:2})},
    '../lib/designTokens':{COLORS:{}},'./city/MapScreenHeader':{default:'Header'},'./profile/IdentityDropdown':{IdentityDropdown:'Identity'},'../lib/api':{getMyBusinesses:async()=>[]},
  }).default;
  const tree=h.render(component,{onCreatePress:()=>creates++});assert.equal(tree.type,'Header');
  const actions=nodes(tree.props.right);for(const id of ['navbar-create','navbar-messages'])assert.ok(actions.find(n=>n.props['data-testid']===id));
  const identity=actions.find(n=>n.type==='Identity');assert.ok(identity);assert.equal(identity.props.compact,true);
  identity.props.onAfterSelect();assert.equal(navigated,'/(tabs)/profile');
  actions.find(n=>n.props['data-testid']==='navbar-create').props.onPress();assert.equal(creates,1);
});

function baseProviderHost(storage,read=key=>storage.get(key) ?? null){
  const h=host();
  const Provider=load('context/MapBoundsContext.tsx',{react:h.react,'react-native':rn,
    '@react-native-async-storage/async-storage':{default:{getItem:async key=>read(key),setItem:async(key,value)=>storage.set(key,value)}},
    '../lib/city/mapBase':baseTools,
  },{window:{localStorage:{getItem:read,setItem:(key,value)=>storage.set(key,value)}}}).MapBoundsProvider;
  return{value:()=>h.render(Provider,{}).props.value,unmount:h.unmount};
}
test('map base selection persists the chosen city without changing its label when the viewport is panned',async()=>{
  const storage=new Map(),h=baseProviderHost(storage);h.value();await flush();let value=h.value();
  const berlin={latitude:52.52,longitude:13.405,label:'Berlin, Germany',latitudeDelta:0.09,longitudeDelta:0.09};
  value.selectMapBase(berlin);value=h.value();assert.equal(value.mapBounds.centerLng,13.405);assert.equal(value.mapBaseRevision,1);
  value.setMapBounds({...value.mapBounds,centerLat:53,centerLng:14});value=h.value();
  assert.equal(value.mapBase.label,'Berlin, Germany');assert.equal(value.mapBaseRevision,1);h.unmount();
  const restored=baseProviderHost(storage);restored.value();await flush();value=restored.value();
  assert.equal(value.mapBase.label,'Berlin, Germany');assert.equal(value.mapBounds.centerLat,52.52);assert.equal(value.isMapInitialized,true);restored.unmount();
});
test('late stored base restoration cannot override a new explicit map-area selection',async()=>{
  let finish;const storage=new Map(),pending=new Promise(resolve=>{finish=resolve;});
  const h=baseProviderHost(storage,key=>key==='@perix_map_base'?pending:null);let value=h.value();
  value.selectMapBase({latitude:53.55,longitude:10,label:'Hamburg, Germany',latitudeDelta:0.09,longitudeDelta:0.09});
  finish(JSON.stringify({...baseTools.DEFAULT_MAP_BASE,label:'Old base'}));await flush();value=h.value();
  assert.equal(value.mapBase.label,'Hamburg, Germany');assert.equal(value.mapBounds.centerLat,53.55);h.unmount();
});
test('invalid map base values are refused and corrupt base storage still permits a valid saved viewport',async()=>{
  const bounds={minLat:52,maxLat:53,minLng:11,maxLng:12,centerLat:52.5,centerLng:11.5};
  const storage=new Map([['@perix_map_base','{bad'],['@perix_map_bounds',JSON.stringify(bounds)]]),h=baseProviderHost(storage);
  h.value();await flush();let value=h.value();assert.equal(value.mapBounds.centerLat,52.5);
  value.selectMapBase({...baseTools.DEFAULT_MAP_BASE,latitude:NaN});value=h.value();assert.equal(value.mapBaseRevision,0);
  assert.equal(value.mapBase.label,baseTools.DEFAULT_MAP_BASE.label);h.unmount();
});
test('public base picker changes only the explore base, not the live/manual user origin, through the existing search',async()=>{
  const h=host(),timers=new Map(),selected=[],areas=[],queries=[];let id=0;
  const component=load('components/city/MapBaseSelector.tsx',{react:h.react,'react-native':rn,'@expo/vector-icons':{Ionicons:'Icon'},
    'react-i18next':{useTranslation:()=>({t:(key,fallback)=>fallback || key})},
    '../../context/MapBoundsContext':{useMapBounds:()=>({mapBase:baseTools.DEFAULT_MAP_BASE,selectMapBase:base=>selected.push(base)})},
    '../../context/LocationContext':{useLocation:()=>({setManualLocation:(...args)=>areas.push(args)})},
    '../../lib/api/mobility':{searchPlaces:async(...args)=>{queries.push(args);return{places:[{name:'Berlin',address:'Berlin, Germany',lat:52.52,lng:13.405},{name:'Bad',lat:NaN,lng:12}]};}},
    '../../lib/city/mapBase':baseTools,
  },{setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key)}).default;
  let tree=h.render(component,{});nodes(tree).find(n=>n.props.testID==='map-base-selector').props.onPress();tree=h.render(component,{});
  nodes(tree).find(n=>n.props.testID==='map-base-query').props.onChangeText('Berlin');tree=h.render(component,{});
  [...timers.values()].forEach(fn=>fn());timers.clear();await flush();tree=h.render(component,{});
  const result=nodes(tree).find(n=>n.type==='Pressable' && textOf(n)==='Berlin, Germany');assert.ok(result);result.props.onPress();
  assert.equal(selected.length,1);assert.equal(selected[0].latitude,52.52);assert.equal(areas[0][0],52.52);assert.equal(queries[0][0],null);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'..','components/city/MapBaseSelector.tsx'),'utf8'),/setUserOrigin|useLiveLocation|watchPosition/);
});
test('a stored map-base update does not override the confirmed origin/destination camera',async()=>{
  const g=gatewayHost(),fix={latitude:52.14,longitude:11.63};g.pin(fix);g.planner(async()=>({itineraries:[itinerary]}));
  await readyAtOrigin(g,null);await chooseSearchResult(g,0,'Destination',true);await flush();g.render();const token=g.map().focusToken;
  g.base({latitude:52.52,longitude:13.405,label:'Berlin, Germany',latitudeDelta:0.09,longitudeDelta:0.09});g.render();g.render();
  assert.equal(g.map().focusRegion.longitude,11.62);assert.equal(g.map().focusToken,token);assert.equal(g.map().pinLocation,fix);
  assert.equal(g.planCalls.length,1);assert.deepEqual(g.reads(),[1,1]);
});

test('only buses and trams on nearest-stop routes receive fleet details without a new read',async()=>{
  const g=gatewayHost();await readyAtOrigin(g);
  for(const mode of ['bus','tram']){
    g.patchVehicle(mode,{next_stop_name:`${mode} next stop`,next_stop_id:'B'});g.render();
    g.map().onMarkerPress(`mobility:${mode}`);g.render();const detail=g.all().find(n=>n.type==='Details').props;
    assert.equal(detail.vehicle.vehicle_id,mode);assert.equal(detail.vehicle.next_stop_name,`${mode} next stop`);
    assert.ok(detail.transitCatalogue.length>0);assert.ok(detail.transitLines.length>0);
    g.patchVehicle(mode,{next_stop_name:'Updated stop'});g.render();assert.equal(g.all().find(n=>n.type==='Details').props.vehicle.next_stop_name,'Updated stop');
  }
  assert.deepEqual(g.reads(),[1,1]);
});

test('vehicle card identifies the unit/next stop and displays parking and departure as separate clocks',()=>{
  const h=host(),clock=load('lib/city/serverClock.ts');
  const Card=load('components/mobility/TransitVehicleDetails.tsx',{react:h.react,'react-native':rn,
    'react-i18next':{useTranslation:()=>({t:(key,fallback)=>fallback || key,i18n:{language:'en'}})},
    '../../lib/city/vehicleDetails':{vehicleStopDetails:()=>({nextStopName:'C stop',currentStopName:'B stop',serviceStopName:'B stop',
      timingAvailable:true,parked:true,parkingAtMs:100000,departureAtMs:130000,departureSeconds:30}),formatTransitEventTime:ms=>`time-${ms}`},
    '../../lib/city/serverClock':clock,
  },{performance:{now:()=>1000},setInterval:()=>1,clearInterval(){}}).default;
  const vehicle={vehicle_id:'marker-7',mode:'tram',name:'7',route_number:'7',route_direction:'South',estimated:true,identity_kind:'VIRTUAL_SCHEDULE',trip_instance_id:'trip-7',position_source:'SCHEDULE'};
  const tree=h.render(Card,{vehicle});const text=textOf(tree);
  assert.match(text,/marker-7/);assert.match(text,/trip-7/);assert.match(text,/Next stop: C stop/);assert.match(text,/At stop: B stop/);
  assert.match(text,/Parking: time-100000/);assert.match(text,/Departure: time-130000 · 0:30/);assert.match(text,/already at the stop/);
  assert.doesNotMatch(text,/GPS Live/);
  assert.match(textOf(h.render(Card,{vehicle:null})),/Vehicle information is unavailable/);h.unmount();
});

test('install banner and help use original logo without changing prompt/dismiss behavior',()=>{
  const h=host(),events=new Map(),storage=new Map();
  const Banner=load('components/InstallBanner.tsx',{react:h.react,'react-native':rn,'@expo/vector-icons':{Ionicons:'Icon'},
    'react-i18next':{useTranslation:()=>({t:(key,fallback)=>fallback || key})},'../lib/designTokens':{COLORS:{}},'./brand/PerixLogo':{default:'Logo'},
  },{window:{matchMedia:()=>({matches:false}),sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)},navigator:{userAgent:'Chrome'},setTimeout:()=>1,clearTimeout(){}}).default;
  h.render(Banner,{});let tree=h.render(Banner,{});const logos=nodes(tree).filter(n=>n.type==='Logo');
  assert.deepEqual(logos.map(n=>n.props.size),['banner','compact']);
  nodes(tree).find(n=>n.props.testID==='install-banner-action').props.onPress();tree=h.render(Banner,{});
  assert.equal(nodes(tree).find(n=>n.type==='Modal').props.visible,true);
  nodes(tree).find(n=>n.type==='Pressable' && n.props.accessibilityLabel==='Dismiss').props.onPress();
  assert.equal(storage.get('perix-install-banner-dismissed'),'1');assert.equal(h.render(Banner,{}),null);h.unmount();assert.equal(events.size,0);
});

test('Members replaces the old Home label while retaining its route and fixed second slot',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','components/city/MapScreenHeader.tsx'),'utf8');
  assert.doesNotMatch(source,/id:'home'/);assert.match(source,/id:'members'[^\n]*path:user\?'\/home':'\/login'/);
  assert.doesNotMatch(source,/id:'explore'/);
});


test('one open map queries every in-scope city and gates transit on the origin', async () => {
  const g = gatewayHost(); await readyAtOrigin(g); g.render();
  assert.equal(g.all().find(n => n.props.testID === 'city-area-switcher'), undefined);
  const magdeburgCalls = g.directoryCalls.at(-1);
  assert.equal(JSON.stringify(magdeburgCalls[5]), JSON.stringify([{ countryCode: 'DE', cityId: 'de-magdeburg' }]));
  assert.ok(g.all().find(n => n.props.testID === 'city-nearby-tracking-panel'));
  const g2 = gatewayHost();
  await readyAtOrigin(g2, { latitude: 52.527, longitude: 11.393, kind: 'manual', name: 'Gardelegen' });
  g2.render();
  assert.equal(JSON.stringify(g2.directoryCalls.at(-1)[5]), JSON.stringify([{ countryCode: 'DE', cityId: 'de-gardelegen' }]));
  assert.equal(g2.all().find(n => n.props.testID === 'city-nearby-tracking-panel'), undefined);
  assert.equal(g2.all().find(n => n.props.testID === 'city-no-nearby-stops'), undefined);
  g.unmount(); g2.unmount();
});
