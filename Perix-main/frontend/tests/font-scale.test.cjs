const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadFontScale() {
  const store = {};
  let flattenImpl = style => style;
  const flattenModule = {};
  Object.defineProperty(flattenModule, 'default', {
    get: () => flattenImpl,
    set: v => { flattenImpl = v; },
    configurable: true,
  });
  let domImpl = (el, props, opts) => props;
  const domModule = {};
  Object.defineProperty(domModule, 'default', {
    get: () => domImpl,
    set: v => { domImpl = v; },
    configurable: true,
  });
  const asyncStorage = {
    default: {
      getItem: async key => (key in store ? store[key] : null),
      setItem: async (key, value) => { store[key] = value; },
    },
  };
  const code = ts.transpileModule(read('lib/fontScale.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  const customRequire = name => {
    if (name === 'react-native/Libraries/StyleSheet/flattenStyle') return flattenModule;
    if (name === 'react-native-web/modules/createDOMProps') return domModule;
    if (name === '@react-native-async-storage/async-storage') return asyncStorage;
    throw new Error('unexpected dependency ' + name);
  };
  vm.runInNewContext(code, { exports, require: customRequire, console });
  const flatten = style => flattenModule.default(style);
  const domProps = (props) => domModule.default('div', props, {});
  return { api: exports, store, flatten, domProps };
}

test('100% is a passthrough and returns identical style objects', async () => {
  const { api, flatten } = loadFontScale();
  await api.setStoredFontScale('100');
  const style = { fontSize: 16, lineHeight: 20, color: 'red' };
  assert.equal(flatten(style), style);
});

test('130% scales fontSize and lineHeight without touching layout props', async () => {
  const { api, flatten } = loadFontScale();
  const plain = value => JSON.parse(JSON.stringify(value));
  await api.setStoredFontScale('130');
  assert.deepEqual(plain(flatten({ fontSize: 16, lineHeight: 20, color: 'red' })),
    { fontSize: 21, lineHeight: 26, color: 'red' });
  assert.deepEqual(plain(flatten([{ fontSize: 14 }, { margin: 4 }])),
    [{ fontSize: 18 }, { margin: 4 }]);
  assert.deepEqual(plain(flatten({ margin: 4 })), { margin: 4 });
});

test('85% shrinks and repeated renders reuse the same scaled copy', async () => {
  const { api, flatten } = loadFontScale();
  assert.deepEqual(JSON.parse(JSON.stringify(flatten({ fontSize: 20 }))), { fontSize: 20 });
  await api.setStoredFontScale('85');
  assert.deepEqual(JSON.parse(JSON.stringify(flatten({ fontSize: 20 }))), { fontSize: 17 });
  const stable = { fontSize: 20, color: 'red' };
  assert.equal(flatten(stable), flatten(stable));
  await api.setStoredFontScale('100');
  assert.equal(flatten(stable), stable);
});

test('web createDOMProps path scales text without mutating the original', async () => {
  const { api, domProps } = loadFontScale();
  await api.setStoredFontScale('130');
  const original = { fontSize: 15 };
  const out = domProps({ style: original });
  assert.deepEqual(JSON.parse(JSON.stringify(out.style)), { fontSize: 20 });
  assert.deepEqual(original, { fontSize: 15 });
});

test('choice persists and legacy values migrate', async () => {
  const { api, store } = loadFontScale();
  await api.setStoredFontScale('130');
  assert.equal(store['perix-font-scale'], '130');
  assert.equal(await api.getStoredFontScale(), '130');
  store['perix-font-scale'] = 'large';
  assert.equal(await api.getStoredFontScale(), '130');
  store['perix-font-scale'] = 'standard';
  assert.equal(await api.getStoredFontScale(), '100');
});

test('scale changes notify subscribers so screens repaint instantly', async () => {
  const { api } = loadFontScale();
  const seen = [];
  const unsub = api.subscribeFontScale(() => seen.push(api.getFontScaleVersion()));
  assert.equal(api.getFontScaleVersion(), 0);
  await api.setStoredFontScale('130');
  assert.equal(seen.length, 1, 'subscriber woke exactly once');
  assert.equal(seen[0], 1, 'version bumped');
  unsub();
  await api.setStoredFontScale('85');
  assert.equal(seen.length, 1, 'unsubscribed listeners stay silent');
});

test('root, /app and /home subscribe to instant font-scale repaints', () => {
  assert.match(read('lib/fontScale.ts'), /export function subscribeFontScale/);
  assert.match(read('lib/fontScale.ts'), /scaleListeners\.add\(listener\)/);
  assert.match(read('app/_layout.tsx'), /useSyncExternalStore\(subscribeFontScale, getFontScaleVersion\)/);
  assert.match(read('components/city/CityGatewayScreen.tsx'), /useSyncExternalStore\(subscribeFontScale, getFontScaleVersion\)/);
  assert.match(read('app/(tabs)/home.tsx'), /useSyncExternalStore\(subscribeFontScale, getFontScaleVersion\)/);
});
