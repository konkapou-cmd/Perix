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
  } }).outputText, { exports, require: name => dependencies[name], URLSearchParams, ...globals });
  return exports;
}
const tools = load('lib/city/googleDirections.ts');
const layout = load('lib/city/mapLayout.ts');
const origin = { latitude: 52.1201, longitude: 11.6271, kind: 'manual', name: 'Entered origin' };
const destination = { latitude: 52.1256, longitude: 11.6342, title: 'Magdeburg Cathedral' };

test('real Embed directions URL uses lat/lon, explicit origin and selected mode, metric units and language', () => {
  for (const mode of ['walking', 'transit', 'driving']) {
    const url = new URL(tools.googleDirectionsEmbedUrl('test-browser-key', origin, destination, mode, 'el'));
    assert.equal(url.origin, 'https://www.google.com');
    assert.equal(url.pathname, '/maps/embed/v1/directions');
    assert.equal(url.searchParams.get('origin'), '52.1201,11.6271');
    assert.equal(url.searchParams.get('destination'), '52.1256,11.6342');
    assert.equal(url.searchParams.get('mode'), mode);
    assert.equal(url.searchParams.get('units'), 'metric');
    assert.equal(url.searchParams.get('language'), 'el');
  }
});
test('no origin, missing key, invalid coordinates or mode never produces a guessed preview', () => {
  assert.equal(tools.googleDirectionsEmbedUrl('test', null, destination, 'walking', 'en'), null);
  assert.equal(tools.googleDirectionsEmbedUrl(' ', origin, destination, 'walking', 'en'), null);
  for (const point of [{ latitude: NaN, longitude: 1 }, { latitude: 91, longitude: 1 }, { latitude: 1, longitude: 181 }]) {
    assert.equal(tools.googleDirectionsEmbedUrl('test', point, destination, 'walking', 'en'), null);
    assert.equal(tools.googleDirectionsOpenUrl(origin, point, 'walking'), null);
  }
  assert.equal(tools.googleDirectionsEmbedUrl('test', origin, destination, 'bus', 'en'), null);
});
test('external Google Maps link preserves selection and never includes a key or forces navigation from a manual origin', () => {
  for (const mode of ['walking', 'transit', 'driving']) {
    const url = new URL(tools.googleDirectionsOpenUrl(origin, destination, mode));
    assert.equal(url.searchParams.get('api'), '1');
    assert.equal(url.searchParams.get('travelmode'), mode);
    assert.equal(url.searchParams.get('origin'), '52.1201,11.6271');
    assert.equal(url.searchParams.has('key'), false);
    assert.equal(url.searchParams.has('dir_action'), false);
  }
  assert.equal(new URL(tools.googleDirectionsOpenUrl(null, destination, 'walking')).searchParams.has('origin'), false);
});

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function previewHost({ key = 'test-browser-key', platform = 'web', point = origin } = {}) {
  const slots = [], effects = []; let index = 0, tree, currentOrigin = point;
  let locationCalls = 0; const opened = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'Fragment',
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useMemo(fn, deps) { const i = index++, old = slots[i];
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) slots[i] = { deps, value: fn() };
      return slots[i].value; },
    useEffect(fn, deps) { const i = index++, old = slots[i];
      if (!old || deps.some((v, j) => !Object.is(v, old[j]))) { slots[i] = deps; effects.push(fn); } },
  };
  const copy = JSON.parse(read('i18n/googleDirections.json')).en;
  const rn = { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: value => value },
    Platform: { OS: platform }, Linking: { openURL: async url => { opened.push(url); } } };
  const component = load('components/mobility/GoogleDirectionsPreview.tsx', {
    react: { ...React, default: React }, 'react-native': rn, 'expo-constants': { default: { expoConfig: { extra: { EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: key } } } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'react-i18next': { useTranslation: () => ({
      t: (key, fallback) => copy[key.replace('googleDirections.', '')] || fallback || key,
      i18n: { language: 'en' },
    }) }, './GoogleDirectionsFrame': { default: 'Frame' }, '../../lib/city/googleDirections': tools,
    '../../lib/city/mapLayout': layout,
  }, { process: { env: {} } }).default;
  const host = {
    render() { index = 0; tree = component({ destination, origin: currentOrigin, onLocate: () => { locationCalls++; }, locating: false });
      effects.splice(0).forEach(fn => fn()); return tree; },
    get: id => nodes(tree).find(node => node.props?.testID === id),
    frame: () => nodes(tree).find(node => node.type === 'Frame'),
    setOrigin: value => { currentOrigin = value; }, opened, locationCalls: () => locationCalls,
    press(id) { host.get(id).props.onPress(); host.render(); host.render(); },
  };
  host.render(); return host;
}
test('preview loads only after user action, switches modes and closes without location requests', () => {
  const h = previewHost(); assert.equal(h.frame(), undefined);
  h.press('google-directions-toggle'); assert.equal(new URL(h.frame().props.src).searchParams.get('mode'), 'walking');
  for (const mode of ['transit', 'driving', 'walking']) {
    h.press(`google-directions-mode-${mode}`);
    assert.equal(new URL(h.frame().props.src).searchParams.get('mode'), mode);
    assert.equal(h.get(`google-directions-mode-${mode}`).props.accessibilityState.selected, true);
  }
  h.press('google-directions-external'); assert.equal(h.opened.length, 1);
  h.press('google-directions-toggle'); assert.equal(h.frame(), undefined);
  assert.equal(h.locationCalls(), 0);
});

test('Go is the sole collapsed action; preview is white without a border and pills share APP/Members colors', () => {
  const h = previewHost();
  const text = nodes(h.render()).filter(n => n.type === 'Text').flatMap(n => n.props.children).join('');
  assert.equal(text, 'Go'); assert.equal(h.get('google-directions-toggle').props.accessibilityState.expanded, false);
  const card = h.get('google-directions-preview').props.style;
  assert.equal(card.backgroundColor, '#fff'); assert.equal(card.borderWidth, undefined); assert.equal(card.borderColor, undefined);
  h.press('google-directions-toggle');
  for (const mode of ['walking', 'transit', 'driving']) {
    const styles = h.get(`google-directions-mode-${mode}`).props.style.filter(Boolean);
    assert.equal(styles[0].borderWidth, undefined); assert.equal(styles[0].borderRadius, 22);
    assert.equal(styles[0].backgroundColor, layout.MAP_ACTION_COLORS.background);
    if (mode === 'walking') assert.equal(styles[1].backgroundColor, layout.MAP_ACTION_COLORS.activeBackground);
  }
  assert.equal(h.get('google-directions-external').props.style.backgroundColor, layout.MAP_ACTION_COLORS.activeBackground);
  const header=read('components/city/MapScreenHeader.tsx');
  assert.match(header,/backgroundColor:'transparent'/);assert.match(header,/activeText:\{color:'#59ABE3'\}/);
  assert.match(header,/text:\{fontSize:14,fontWeight:'600',color:'#064472'\}/);
});
test('live fixes never reload the route preview until an explicit refresh; opening again captures the new origin', () => {
  const h = previewHost(); h.press('google-directions-toggle');
  const first = h.frame().props;
  h.setOrigin({ latitude: 52.13, longitude: 11.63, kind: 'live' }); h.render(); h.render();
  assert.equal(h.frame().props.src, first.src); assert.equal(h.frame().props.key, first.key);
  h.press('google-directions-refresh');
  assert.equal(new URL(h.frame().props.src).searchParams.get('origin'), '52.13,11.63');
  assert.notEqual(h.frame().props.key, first.key);
  h.press('google-directions-toggle'); h.setOrigin(origin); h.render(); h.press('google-directions-toggle');
  assert.equal(new URL(h.frame().props.src).searchParams.get('origin'), '52.1201,11.6271');
});
test('unknown origin has a locate action and external fallback, then accepts first actual origin without another watcher', () => {
  const h = previewHost({ point: null }); h.press('google-directions-toggle');
  assert.equal(h.frame(), undefined); assert.ok(h.get('google-directions-external'));
  h.press('google-directions-locate'); assert.equal(h.locationCalls(), 1);
  h.setOrigin(origin); h.render(); h.render(); assert.ok(h.frame());
  assert.equal(new URL(h.frame().props.src).searchParams.get('origin'), '52.1201,11.6271');
});
test('missing key, iframe network failure and native platform retain an external link without inventing a route', () => {
  const noKey = previewHost({ key: '' }); noKey.press('google-directions-toggle');
  assert.equal(noKey.frame(), undefined); assert.ok(noKey.get('google-directions-external'));
  const native = previewHost({ platform: 'ios' }); native.press('google-directions-toggle');
  assert.equal(native.frame(), undefined); assert.ok(native.get('google-directions-external'));
  const h = previewHost(); h.press('google-directions-toggle'); h.frame().props.onError(); h.render();
  assert.equal(h.frame(), undefined); assert.ok(h.get('google-directions-external'));
  h.press('google-directions-refresh'); assert.ok(h.frame());
});
test('web iframe retains Google attribution/UI, uses domain-only referrer, meets minimum size and cannot claim route success from onLoad', () => {
  const source = read('components/mobility/GoogleDirectionsFrame.web.tsx');
  assert.match(source, /referrerPolicy="strict-origin-when-cross-origin"/);
  assert.match(source, /height: 300, minWidth: 200/);
  assert.doesNotMatch(source, /onLoad|sandbox=|contentDocument|postMessage/);
  assert.doesNotMatch(read('components/mobility/GoogleDirectionsPreview.tsx'), /watchPosition|planJourney|computeRoutes|fetch\(/);
});
test('all ten languages have complete preview copy installed into the existing city namespace', () => {
  const copy = JSON.parse(read('i18n/googleDirections.json'));
  assert.deepEqual(Object.keys(copy).sort(), Object.keys(JSON.parse(read('i18n/city.json'))).sort());
  for (const resource of Object.values(copy)) {
    assert.deepEqual(Object.keys(resource).sort(), Object.keys(copy.en).sort());
    assert.ok(Object.values(resource).every(value => typeof value === 'string' && value.trim().length));
  }
  assert.match(read('i18n/city.ts'), /googleDirections: googleDirections\[/);
});

test('shared map header registers city translations even on a direct Locator entry without mounting Gateway', () => {
  assert.match(read('components/city/MapScreenHeader.tsx'), /import "\.\.\/\.\.\/i18n\/city";/);
  const copy = JSON.parse(read('i18n/city.json'));
  for (const resource of Object.values(copy)) assert.ok(resource.ui.country);
});

test('header action pills are transparent with selected blue and idle navy text; first App category is public services',()=>{
  const header=read('components/city/MapScreenHeader.tsx');
  assert.match(header,/backgroundColor:'transparent'/);assert.match(header,/color:'#064472'/);assert.match(header,/activeText:\{color:'#59ABE3'\}/);
  assert.doesNotMatch(header,/MAP_ACTION_COLORS\.activeBackground/);
  assert.match(read('lib/city/gateway.ts'),/return \[\s*services \? publicNode\(services, language\)/);
  assert.match(read('i18n/city.ts'),/CITY_ROOT_IDS = \["public-services", "mobility", "events"/);
  const category=read('components/city/CityGatewayScreen.tsx');
  assert.match(category,/const query = current\?\.query \|\| \{ kinds: \[\], publicOnly: true, publicCategory: "public-services" \}/);
  assert.match(category,/styles\.publicServiceTitle/);
});
