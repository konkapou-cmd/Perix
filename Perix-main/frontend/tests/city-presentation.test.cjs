/* global __dirname */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "..");

function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function load(file, dependencies = {}) {
  const exports = {};
  const javascript = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(javascript, { exports, require: name => dependencies[name] });
  return exports;
}

test("Gateway event/activity/business/service/product pins reuse the Locator colour tokens", () => {
  const { COLORS } = load("lib/designTokens.ts");
  const presentation = load("lib/city/presentation.ts", { "../designTokens": { COLORS } });
  const expected = { business: "pinBusiness", event: "pinEvent", activity: "pinActivity", hotel: "pinHotel", service: "pinService", job: "pinJob", rental: "pinRental", product: "pinProduct", home: "pinHome" };
  for (const [kind, token] of Object.entries(expected)) assert.equal(presentation.GATEWAY_ENTITY_COLORS[kind], COLORS[token], kind);
  assert.equal(presentation.gatewayEntityColor({ type: "business", category_ids: ["local-hotels"] }), COLORS.pinHotel);
  assert.equal(presentation.gatewayNodeColor({ query: { kinds: ["event"] } }), COLORS.pinEvent);
  assert.equal(presentation.gatewayNodeColor({ query: { kinds: ["activity"] } }), COLORS.pinActivity);
  assert.equal(presentation.gatewayNodeColor({ query: { kinds: [], publicCategory: "ps:sos" } }), COLORS.danger);
});

test("the original wordmark asset is local, proportional, accessible and not redrawn/tinted", () => {
  const source = read("components/brand/PerixLogo.tsx");
  assert.match(source, /assets\/brand\/perix-wordmark\.png/);
  assert.match(source, /resizeMode="contain"/);
  assert.match(source, /height: width \/ ASPECT_RATIO/);
  assert.match(source, /accessibilityLabel=\{greek \? "Πέριξ" : "Perix"\}/);
  assert.doesNotMatch(source, /tintColor|https?:|<Text|fontFamily/);
  const png = fs.readFileSync(path.join(root, "assets/brand/perix-wordmark.png"));
  assert.equal(png.readUInt32BE(16), 1139);
  assert.equal(png.readUInt32BE(20), 400);
});

test("logo follows the existing application language, with a stable size and no extra preference", () => {
  let language = "el";
  const exports = {};
  const code = ts.transpileModule(read("components/brand/PerixLogo.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
  const dependencies = {
    react: { default: { createElement: (type, props) => ({ type, props }) } },
    "react-native": { Image: "image" },
    "react-i18next": { useTranslation: () => ({ i18n: { resolvedLanguage: language } }) },
    "../../assets/brand/perix-wordmark.png": "latin-artwork",
    "../../assets/brand/perix-wordmark-el.png": "greek-artwork",
  };
  vm.runInNewContext(code, { exports, require: name => dependencies[name] });
  const logo = exports.default;
  const greek = logo({ size: "gateway" });
  assert.equal(greek.props.source, "greek-artwork");
  assert.equal(greek.props.accessibilityLabel, "Πέριξ");
  for (const code of ["en", "de", "fr", "it", "es", "sq", "sr", "pl", "ru"]) {
    language = code;
    const result = logo({ size: "gateway" });
    assert.equal(result.props.source, "latin-artwork");
    assert.equal(result.props.style.width, greek.props.style.width);
    assert.equal(result.props.style.height, greek.props.style.height);
  }
  const source = read("components/brand/PerixLogo.tsx");
  assert.doesNotMatch(source, /AsyncStorage|localStorage|useState|changeLanguage/);
  const png = fs.readFileSync(path.join(root, "assets/brand/perix-wordmark-el.png"));
  assert.equal(png.readUInt32BE(16), 1173);
  assert.equal(png.readUInt32BE(20), 460);
});

test("Gateway, mobile Home, desktop Home and login use the same scoped logo", () => {
  assert.match(read("components/city/CityGatewayScreen.tsx"), /<PerixLogo size=\{compact \? "header" : "gateway"\}/);
  assert.match(read("app/(tabs)/home.tsx"), /<PerixLogo size="compact"/);
  assert.match(read("app/(auth)/login.tsx"), /<PerixLogo size="login"/);
  assert.match(read("components/TopNavbar.tsx"), /brandLogo \? <PerixLogo/);
  assert.match(read("components/GlobalWebChrome.tsx"), /brandLogo=\{routeSegments\[0\] === "\(tabs\)" && routeSegments\[1\] === "home"\}/);
});

test("Gateway has a white background and a non-interactive sky-blue map outline", () => {
  const source = read("components/city/CityGatewayScreen.tsx");
  assert.match(source, /page: \{[^}]*backgroundColor: "#fff"/);
  assert.match(source, /testID="city-map-border" pointerEvents="none"/);
  assert.match(source, /mapBorder: \{[^}]*borderWidth: 2, borderColor: COLORS\.pinHotel/);
  assert.doesNotMatch(source.match(/<BusinessMap[\s\S]*?\/>/)[0], /\bkey=/);
});

test("Home typography uses existing readable tokens without changing the global font system", () => {
  const source = read("app/(tabs)/home.tsx");
  assert.match(source, /contentCardTitle: \{ fontSize: FONT_SIZES\.bodySmall, fontWeight: FONT_WEIGHTS\.semibold/);
  assert.match(source, /contentCardSub: \{ fontSize: FONT_SIZES\.small, color: COLORS\.textMuted/);
  assert.match(source, /locationSearchPillText: \{ fontSize: FONT_SIZES\.caption/);
  assert.doesNotMatch(source, /fontFamily:/);
});

test("Home category accents follow the existing Locator tokens with readable event/activity filters", () => {
  const source = read("app/(tabs)/home.tsx");
  for (const token of ["pinEvent", "pinActivity", "pinBusiness", "pinHotel", "pinService", "pinJob", "pinRental", "pinProduct", "pinHome"]) assert.ok(source.includes(`color={COLORS.${token}}`));
  assert.equal((source.match(/activeFilterTextColor=\{COLORS.textPrimary\}/g) || []).length, 2);
});

test("centered logo, circular language picker and search precede the unchanged map", () => {
  const source = read("components/city/CityGatewayScreen.tsx");
  assert.ok(source.indexOf('testID="city-centered-brand"') < source.indexOf('testID="city-search-bar"'));
  assert.ok(source.indexOf('testID="city-search-bar"') < source.indexOf("<BusinessMap"));
  assert.match(source, /testID="city-map-frame"[^>]*marginTop: 12/);
  assert.match(source, /headerCenter: \{[^}]*left: 60, right: 60/);
  assert.match(source, /tile: \{[^}]*backgroundColor: "#fff"[^}]*borderColor: COLORS.pinHotel/);
  for (const removed of ["Ενεργό φίλτρο χάρτη", "Όλες οι δημόσιες κατηγορίες", "Εξερεύνησε την πόλη", "Πραγματικά δημόσια αποτελέσματα, χωρίς"]) assert.ok(!source.includes(removed));
  assert.match(source, /!current \|\| \(!discovery.loading && !empty\)/);
});
