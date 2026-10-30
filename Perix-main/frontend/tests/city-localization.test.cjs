/* global __dirname */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const i18next = require("i18next");
const root = path.join(__dirname, "..");
const copy = JSON.parse(fs.readFileSync(path.join(root, "i18n/city.json"), "utf8"));
function load(file, dependencies) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { exports, require: name => dependencies[name] });
  return exports;
}
const installed = [];
const registry = load("i18n/city.ts", { "./index": { default: { isInitialized: true, addResourceBundle: (...args) => installed.push(args) } }, "./city.json": { default: copy } });
const helper = load("lib/city/localization.ts", {
  "../../i18n/city": registry, "../api/core": { ACTIVITY_CATEGORIES: {}, ACTIVITY_SUBCATEGORIES: {} },
  "../marketplace/marketplaceTaxonomy": { MARKETPLACE_CATEGORIES: [] }, "../config/serviceModules": { SERVICE_MODULES: {} },
  "../categoryTranslation": { translateJobType: value => value },
});

test("all ten supported languages have complete root, empty-state and source translations", () => {
  const supported = [...fs.readFileSync(path.join(root, "i18n/index.ts"), "utf8").matchAll(/code: '([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(Object.keys(copy).sort(), supported.sort());
  assert.equal(installed.length, supported.length);
  for (const [language, resource] of Object.entries(copy)) {
    assert.equal(resource.roots.length, 14, language);
    assert.equal(resource.empty.length, 13, language);
    assert.equal(new Set(resource.empty).size, 13, language);
    assert.equal(resource.groups.length, 7, language);
    assert.equal(resource.source.length, 14, language);
    assert.deepEqual(Object.keys(resource.ui).sort(), Object.keys(copy.en.ui).sort(), language);
    assert.deepEqual(Object.keys(resource.leaves).sort(), Object.keys(copy.en.leaves).sort(), language);
    for (const value of [...resource.roots, ...resource.empty, ...resource.groups, ...resource.source, ...Object.values(resource.ui)]) assert.ok(value.trim().length > 0);
  }
});

test("switching languages changes labels and category-specific messages, never IDs or filters", async () => {
  const instance = i18next.createInstance();
  await instance.init({ lng: "en", fallbackLng: "en", resources: Object.fromEntries(Object.entries(copy).map(([code, value]) => [code, { city: value }])), defaultNS: "city", interpolation: { escapeValue: false } });
  const queries = registry.CITY_ROOT_IDS.map(() => ({ kinds: ["event"] }));
  const nodes = registry.CITY_ROOT_IDS.map((id, i) => ({ id, label: "original", icon: "calendar", query: queries[i] }));
  for (const language of Object.keys(copy)) {
    await instance.changeLanguage(language);
    const t = instance.getFixedT(language, "city");
    const translated = helper.localizeGatewayNodes(nodes, t, t);
    translated.forEach((node, i) => { assert.equal(node.id, nodes[i].id); assert.equal(node.query, queries[i]); assert.equal(node.label, copy[language].roots[i]); });
    assert.equal(t("empty.0"), copy[language].empty[0]);
    assert.equal(t("empty.1"), copy[language].empty[1]);
  }
});

test("only a confirmed successful final empty result can hide category boxes", () => {
  const base = { loading: false, error: null, partial: false, hasMore: false, items: [] };
  assert.equal(helper.confirmedEmpty(base), true);
  for (const state of [{ loading: true }, { error: "loadError" }, { partial: true }, { hasMore: true }, { items: [{ id: "real" }] }]) assert.equal(helper.confirmedEmpty({ ...base, ...state }), false);
});

test("flags are bundled PNG assets and language selection reuses existing persistent i18n", () => {
  const source = fs.readFileSync(path.join(root, "components/city/CityLanguagePicker.tsx"), "utf8");
  assert.match(source, /await setStoredLanguage\(code\)/);
  assert.match(source, /appI18n\.resolvedLanguage \|\| appI18n\.language/);
  assert.doesNotMatch(source, /if \(i18n\.language/);
  assert.match(source, /width: 44, height: 44, borderRadius: 22/);
  assert.doesNotMatch(source, /https?:|fetch\(|apiRequest|sessionToken|router\./);
  const flags = [...source.matchAll(/flags\/([a-z]+)\.png/g)].map(m => m[1]);
  assert.equal(flags.length, 10);
  for (const flag of flags) assert.ok(fs.existsSync(path.join(root, `assets/brand/flags/${flag}.png`)));
});

test("language dialog closes using the shared app instance even when the hook snapshot is stale", async () => {
  const source = fs.readFileSync(path.join(root, "components/city/CityLanguagePicker.tsx"), "utf8");
  const ast = ts.createSourceFile("CityLanguagePicker.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "changeLanguage") handler = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(handler);
  const code = ts.transpileModule(`exports.changeLanguage = ${handler};`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const appI18n = { language: "en", resolvedLanguage: "en" };
  const oldHookSnapshot = { language: "en", resolvedLanguage: "en" };
  const state = { open: true, error: false, saving: false };
  const exports = {};
  let persisted = null;
  vm.runInNewContext(code, { exports, saving: false, appI18n, i18n: oldHookSnapshot,
    setOpen: value => { state.open = value; }, setError: value => { state.error = value; }, setSaving: value => { state.saving = value; },
    setStoredLanguage: async code => { persisted = code; appI18n.language = code; appI18n.resolvedLanguage = code; },
  });
  await exports.changeLanguage("el");
  assert.equal(persisted, "el");
  assert.equal(oldHookSnapshot.language, "en");
  assert.equal(state.open, false);
  assert.equal(state.error, false);
  assert.equal(state.saving, false);
});
