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

test("Gateway keeps OSM route credit visibly on the map and puts extra source details in a disclosure", () => {
  const source = read("components/city/CityGatewayScreen.tsx");
  const { hasOsmTransitRouting } = load("lib/city/transitAttribution.ts");
  assert.equal(hasOsmTransitRouting([]), false);
  for (const name of ["OSM_ROADS", "OSM_RAIL", "OSM_ROADS_SEGMENTS", "OSM_RAIL_SEGMENTS"]) {
    assert.equal(hasOsmTransitRouting([{ source: name }]), true, name);
  }
  for (const name of [undefined, "", "GTFS", "PERIX_MANUAL", "OSM_UNKNOWN"]) {
    assert.equal(hasOsmTransitRouting([{ source: name }]), false, String(name));
  }
  assert.match(source, /hasOsmTransitRouting\(transitLines\)/);
  assert.match(source, /city-osm-routing-attribution/);
  assert.match(source, /© OpenStreetMap contributors/);
  assert.match(source, /accessibilityRole="link"/);
  assert.match(source, /https:\/\/www\.openstreetmap\.org\/copyright/);
  assert.ok(source.indexOf('testID="city-osm-routing-attribution"') > source.indexOf('testID="city-map-frame"'));
  assert.match(source, /testID="city-map-info-toggle"/);
  assert.match(source, /accessibilityState=\{\{expanded:mapInfoExpanded\}\}/);
  assert.match(source, /useState\(false\)/);
  assert.ok(source.indexOf('testID="city-map-info-toggle"') > source.indexOf('testID="city-map-frame"'));
  assert.ok(source.indexOf('testID="city-map-info-toggle"') < source.indexOf('testID="city-destination"'));
});

test("Gateway discloses the version-bound schedule publisher on demand without guessing", () => {
  const source = read("components/city/CityGatewayScreen.tsx");
  const { schedulePublisher } = load("lib/city/transitAttribution.ts");
  const good = { manifest: { publisher: { publisher_name: "gtfs.de / DELFI e.V.", publisher_url: "https://gtfs.de" } } };
  for (const input of [[good], [{ manifest: null }, good]]) {
    const credit = schedulePublisher(input);
    assert.equal(credit && credit.name, "gtfs.de / DELFI e.V.");
    assert.equal(credit && credit.url, "https://gtfs.de");
  }
  for (const manifests of [[], null, undefined, [{}], [{ manifest: null }],
    [{ manifest: { publisher: { publisher_name: "", publisher_url: "https://gtfs.de" } } }],
    [{ manifest: { publisher: { publisher_name: "gtfs.de", publisher_url: "" } } }],
    [{ manifest: { publisher: { publisher_name: "gtfs.de", publisher_url: "http://insecure.example/x" } } }],
    [{ manifest: { publisher: { publisher_name: "gtfs.de", publisher_url: "https://gtfs.de/x y" } } }],
    [{ manifest: { publisher: { publisher_name: "x".repeat(501), publisher_url: "https://gtfs.de" } } }],
    "not-an-array"]) {
    assert.equal(schedulePublisher(manifests), null, JSON.stringify(manifests));
  }
  assert.match(source, /schedulePublisher\(scheduleManifests\)/);
  assert.match(source, /city-schedule-attribution/);
  assert.match(source, /city\("schedulePrefix"\)/);
  assert.ok(source.indexOf('testID="city-schedule-attribution"') > source.indexOf('testID="city-map-frame"'));
  assert.ok(source.indexOf('testID="city-schedule-attribution"') > source.indexOf('testID="city-map-info-panel"'));
  assert.doesNotMatch(source, /CC BY|creativecommons|license|License/);
});

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

test("events use the requested orange-red blend consistently without changing unrelated categories",()=>{
  const tokens=load('lib/designTokens.ts');
  assert.equal(tokens.COLORS.pinEvent,'#F15A35');assert.equal(tokens.COLORS.eventsAccent,'#F15A35');
  assert.equal(load('lib/city/presentation.ts',{'../designTokens':{COLORS:tokens.COLORS}}).GATEWAY_ENTITY_COLORS.event,'#F15A35');
  assert.equal(load('lib/categoryIcons.ts',{'@expo/vector-icons':{Ionicons:{glyphMap:{}}}}).CATEGORY_COLORS['entertainment-events'],'#F15A35');
  assert.equal(tokens.COLORS.pinBusiness,'#142B6F');
});

test("carved compass wordmark is local, proportional and accessible", () => {
  const source = read("components/brand/PerixLogo.tsx");
  assert.match(source, /assets\/brand\/perix-carved-compass\.png/);
  assert.match(source, /resizeMode="contain"/);
  assert.match(source, /height: width \/ ASPECT_RATIO/);
  assert.match(source, /accessibilityLabel="Perix"/);
  assert.match(source, /variant\?: "watercolor" \| "english"/);
  assert.doesNotMatch(source, /https?:|<Text|fontFamily|resolvedLanguage|GREEK_WORDMARK/);
  const png = fs.readFileSync(path.join(root, "assets/brand/perix-carved-compass.png"));
  assert.equal(png.readUInt32BE(16), 2089);
  assert.equal(png.readUInt32BE(20), 753);
});

test("the carved compass wordmark is stable across locales and used by every variant", () => {
  const exports = {};
  const code = ts.transpileModule(read("components/brand/PerixLogo.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
  const dependencies = {
    react: { default: { createElement: (type, props) => ({ type, props }) } },
    "react-native": { Image: "image", Platform: { select: values => values.web } },
    "../../assets/brand/perix-carved-compass.png": "carved-compass-artwork",
  };
  vm.runInNewContext(code, { exports, require: name => dependencies[name] });
  const logo = exports.default;
  const reference = logo({ size: "gateway" });
  assert.equal(reference.props.source, "carved-compass-artwork");
  assert.equal(reference.props.accessibilityLabel, "Perix");
  const referenceStyle=Object.assign({},...(Array.isArray(reference.props.style)?reference.props.style:[reference.props.style]).filter(Boolean));
  for (const locale of ["en", "el", "de", "fr", "it", "es", "sq", "sr", "pl", "ru"]) {
    void locale;
    const result = logo({ size: "gateway" });
    assert.equal(result.props.source, "carved-compass-artwork");
    const resultStyle=Object.assign({},...(Array.isArray(result.props.style)?result.props.style:[result.props.style]).filter(Boolean));
    assert.equal(resultStyle.width, referenceStyle.width);
    assert.equal(resultStyle.height, referenceStyle.height);
  }
  const source = read("components/brand/PerixLogo.tsx");
  assert.doesNotMatch(source, /AsyncStorage|localStorage|useState|changeLanguage/);
  const regularCompact=logo({size:"compact"});
  const regularCompactStyle=Object.assign({},...(Array.isArray(regularCompact.props.style)?regularCompact.props.style:[regularCompact.props.style]).filter(Boolean));
  const locatorEnglish=logo({size:"compact",variant:"english"});
  const locatorStyle=Object.assign({},...(Array.isArray(locatorEnglish.props.style)?locatorEnglish.props.style:[locatorEnglish.props.style]).filter(Boolean));
  assert.equal(locatorEnglish.props.source,"carved-compass-artwork");
  assert.ok(locatorStyle.width>regularCompactStyle.width);
  assert.ok(locatorStyle.filter.includes("drop-shadow"));
});

test("app, home and locator headers use the English wordmark while login keeps the default logo", () => {
  assert.match(read("components/city/CityGatewayScreen.tsx"), /<PerixLogo size=\{compactHeader\?'mobileHeader':'compact'\} variant="english"/);
  assert.match(read("app/(tabs)/home.tsx"), /<PerixLogo size=\{compactHeader\?'mobileHeader':'compact'\} variant="english"/);
  assert.match(read("app/(auth)/login.tsx"), /<PerixLogo size="login"/);
  assert.match(read("components/TopNavbar.tsx"), /<MapScreenHeader hideExplore logoVariant=\{isHome \|\| isLocator \? "english" : undefined\} right=/);
  assert.match(read("components/GlobalWebChrome.tsx"), /<MapScreenHeader exploreOnly=\{isLocator\} logoVariant=\{isLocator \? "english" : undefined\}/);
  assert.match(read("components/city/MapScreenHeader.tsx"), /<PerixLogo size=\{metrics.compact\?'mobileHeader':'compact'\} variant=\{logoVariant\}/);
  assert.match(read("components/locator/LegacyLocatorScreen.tsx"), /<MapScreenHeader logoVariant="english"/);
  assert.doesNotMatch(read("components/TopNavbar.tsx"), /<Text[^>]*>Perıx/);
});

test("Gateway has a white background and a neutral non-interactive map frame", () => {
  const source = read("components/city/CityGatewayScreen.tsx");
  assert.match(source, /page: \{[^}]*backgroundColor: "#fff"/);
  assert.match(source, /testID="city-map-border" pointerEvents="none"/);
  assert.match(source, /mapBorder: \{[^}]*borderWidth: 1, borderColor: COLORS\.divider/);
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

test("flex header with visible language picker and locator-style cards precede the unchanged map", () => {
  const source = read("components/city/CityGatewayScreen.tsx");
  assert.ok(source.indexOf('testID="city-centered-brand"') < source.indexOf('testID="city-search-bar"'));
  assert.ok(source.indexOf('testID="city-search-bar"') < source.indexOf("<BusinessMap"));
  assert.match(source, /testID="city-map-frame"[^>]*marginTop: 12/);
  assert.match(source, /content: \{[^}]*paddingTop: 6, gap: 6/);
  assert.doesNotMatch(source, /city\("googleDirections\.selectCard"\)/);
  assert.match(source, /headerRow: \{[^}]*flexDirection: "row"[^}]*justifyContent: "space-between"/);
  assert.doesNotMatch(source, /headerCenter: \{[^}]*position: "absolute"/);
  assert.match(source,/categoryButtonFace:\{[^}]*backgroundColor:'#fff'[^}]*borderWidth:1/);
  assert.match(source,/categoryButton:\{alignItems:'center',gap:8/);
  assert.doesNotMatch(source,/tile: \{ minHeight: 96/,'large card wrappers are replaced by artwork-sized button faces');
  assert.match(source,/style=\{\(\{pressed\}\)=>\[styles\.categoryButton/);
  assert.match(source, /node\.id==="public-services" \? "#59ABE3"/);
  for (const removed of ["Ενεργό φίλτρο χάρτη", "Όλες οι δημόσιες κατηγορίες", "Εξερεύνησε την πόλη", "Πραγματικά δημόσια αποτελέσματα, χωρίς"]) assert.ok(!source.includes(removed));
  assert.match(source, /visibleCategories\.length>0/);
});

test("Locator empty-result copy is blue and App text uses the shared Locator font family",()=>{
  const locator=read("components/locator/LegacyLocatorScreen.tsx"),empty=read("components/shared/EmptyState.tsx");
  assert.equal((locator.match(/messageColor="#59ABE3"/g)||[]).length,6);
  assert.match(empty,/messageColor\?: string/);
  assert.match(empty,/messageColor \? \{ color: messageColor \}/);
  const app=read("components/city/CityGatewayScreen.tsx");
  assert.match(app,/LOCATOR_FONT_FAMILY\.regular/);assert.match(app,/LOCATOR_FONT_FAMILY\.semibold/);
  assert.match(app,/LOCATOR_FONT_FAMILY \} from "..\/..\/lib\/designTokens"/);
  assert.match(read("lib/designTokens.ts"),/LOCATOR_FONT_FAMILY = \{/);
  assert.match(read("lib/designTokens.ts"),/regular: "Quicksand_400Regular"/);
  assert.match(read("components/home/HomeDiscoveryPanel.tsx"),/LOCATOR_FONT_FAMILY\.(regular|semibold)/);
  assert.match(read("components/locator/LocatorCard.tsx"),/fontFamily: LOCATOR_FONT_FAMILY\.semibold/);
  assert.match(read("components/locator/LocatorCard.tsx"),/fontFamily: LOCATOR_FONT_FAMILY\.regular/);
  assert.match(read("app/_layout.tsx"),/applyDefaultFontFamily\("Quicksand_400Regular"\)/);
  assert.match(locator,/listTitle: \{[^}]*color: "#59ABE3"/);
  assert.match(locator,/openNowBtnActive: \{[^}]*backgroundColor: "#59ABE3"/);
  assert.match(locator,/openNowText: \{[^}]*color: "#59ABE3"/);
  assert.match(read("components/TopNavbar.tsx"),/logoVariant=\{isHome \|\| isLocator \? "english" : undefined\}/);
  assert.match(read("components/brand/PerixLogo.tsx"),/drop-shadow\(1px 1px 1px rgba\(5,31,58,0\.48\)\)/);
});

test("public service detail keeps Perix chrome with back navigation and a filled cover crop",()=>{
  const page=read("app/public-services/[id].tsx");
  assert.match(page,/<MapScreenHeader logoVariant="english" onBack=/);
  assert.match(page,/router\.canGoBack\(\) \? router\.back\(\) : router\.navigate\("\/app"/);
  assert.match(page,/<AppBottomNavigation \/>/);
  assert.match(read("components/city/MapScreenHeader.tsx"),/onBack\?:\(\)=>void/);
  assert.match(read("components/city/MapScreenHeader.tsx"),/testID="map-header-back"/);
  assert.match(read("components/city/MapScreenHeader.tsx"),/name="arrow-back"/);
  const card=read("components/city/GatewayResultCard.tsx");
  assert.match(card,/contentFit="cover"/);assert.doesNotMatch(card,/contentFit=\{entity\.publicService \? "contain"/);
  assert.match(card,/width:"100%",height:"100%"/);
});

test("Home pins City Ads and its city picker above the feed, hides carousels, and keeps posts",()=>{
  const home=read("app/(tabs)/home.tsx"),ads=read("components/home/CityAdCircles.tsx"),identity=read("components/profile/IdentityDropdown.tsx");
  assert.ok(home.indexOf("<CityAdCircles") < home.indexOf("      <FlatList"));
  assert.match(home, /locationLabel=\{userOrigin\?\.name/);
  assert.match(home, /hideCarousel/);assert.match(ads, /!hideCarousel && <ScrollView horizontal/);
  assert.match(ads, /testID="home-city-picker"/);
  assert.match(home, /\{false && <>[\s\S]*?<CarouselSection/);
  assert.match(home, /data=\{homeLayout\.sections\.find\(s => s\.id === "posts"\)/);
  assert.doesNotMatch(home, /<HomeHeaderControls|<LayoutSettingsModal/);
  assert.match(home, /MapScreenHeader hideExplore logoVariant="english" right=\{<IdentityDropdown compact/);
  assert.match(read("components/TopNavbar.tsx"), /<MapScreenHeader hideExplore /);
  assert.match(read("components/TopNavbar.tsx"), /<IdentityDropdown compact businesses=\{businesses\}/);
  assert.match(read("components/TopNavbar.tsx"), /onAfterSelect=\{\(\)=>router\.navigate\("\/\(tabs\)\/profile" as any\)\}/);
  assert.match(identity, /testID=\{compact \? "account-type-switcher"/);
  assert.match(identity, /backgroundColor: "#DDF2FF"/);
});
