/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');

function mount(warnings) {
  const exports = {}, links = [];
  const source = fs.readFileSync(path.join(__dirname, '../components/shared/MobilityServiceWarnings.tsx'), 'utf8');
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Linking: { openURL: url => { links.push(url); return Promise.resolve(); } } },
    'react-i18next': { useTranslation: () => ({ t: (_key, fallback, values = {}) => fallback.replace(/{{(\w+)}}/g, (_, k) => values[k]) }) },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => mocks[name] });
  const tree = exports.default({ warnings });
  const all = [];
  function visit(node) { if (!node) return; if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node === 'object') { all.push(node); visit(node.props?.children); } }
  visit(tree);
  return { tree, all, links, text: all.filter(x => x.type === 'Text').map(x => x.props.children).join(' ') };
}

test('operator timetable conflict is explicit, deduplicated by route/notice, and links to its actual source', () => {
  const warning = { route_number: '13', status: 'OPERATOR_DIVERSION_NOT_IN_TIMETABLE', notice_id: 'bridge',
    message: 'Jordanstraße entfällt; via Am Fuchsberg.', source_url: 'https://www.mvbnet.de/operator-notice/' };
  const ui = mount([warning, { ...warning, direction: 'opposite' }]);
  assert.match(ui.text, /13: operator diversion is not reflected in the timetable/);
  assert.match(ui.text, /Map positions and times may be inaccurate/);
  assert.match(ui.text, /Am Fuchsberg/);
  const links = ui.all.filter(x => x.type === 'Pressable');
  assert.equal(links.length, 1); links[0].props.onPress();
  assert.equal(ui.links[0], warning.source_url);
});

test('existing geometry warnings remain visible; no warning leaves no banner', () => {
  assert.equal(mount([]).tree, null);
  assert.match(mount([{ route_number: '6', status: 'OSM_VERIFICATION_REQUIRED' }]).text, /Umleitung wird geprüft: 6/);
});

test('one operator notice groups its affected routes instead of repeating a large banner', () => {
  const warnings = ['N3', '13', 'N5', '13'].map(route_number => ({ route_number, notice_id: 'bridge',
    status: 'OPERATOR_DIVERSION_NOT_IN_TIMETABLE', message: 'One operator message', source_url: 'https://www.mvbnet.de/notice/' }));
  const ui = mount(warnings);
  assert.match(ui.text, /13, N3, N5: operator diversion/);
  assert.equal(ui.all.filter(x => x.type === 'Pressable').length, 1);
  assert.equal(ui.text.match(/One operator message/g).length, 1);
});

test('untrusted non-HTTPS schemes never become actionable operator links', () => {
  const ui = mount([{ route_number: '13', status: 'OPERATOR_NOTICE_REVIEW_REQUIRED', source_url: 'javascript:alert(1)' }]);
  assert.equal(ui.all.filter(x => x.type === 'Pressable').length, 0);
});
