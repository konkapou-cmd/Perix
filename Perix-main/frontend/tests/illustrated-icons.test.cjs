/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { test } = require("node:test");
const root = path.join(__dirname, "..");

function load(file) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(javascript, { exports, require: (asset) => asset });
  return exports;
}

test("installed illustration maps cover home/business, current Marketplace taxonomy, and all service modules only", () => {
  const icons = load("lib/illustrationSources.generated.ts");
  assert.equal(Object.keys(icons.HOME_ILLUSTRATIONS).length, 14);
  assert.equal(Object.keys(icons.ROOT_CATEGORY_ILLUSTRATIONS).length, 15);
  assert.equal(Object.keys(icons.CATEGORY_GROUP_ILLUSTRATIONS).length, 38);
  assert.equal(Object.keys(icons.SUBCATEGORY_ILLUSTRATIONS).length, 164);
  assert.equal(Object.keys(icons.MARKETPLACE_PARENT_ILLUSTRATIONS).length, 13);
  assert.equal(Object.keys(icons.MARKETPLACE_SUBCATEGORY_ILLUSTRATIONS).length, 122);
  assert.equal(Object.keys(icons.SERVICE_MODULE_ILLUSTRATIONS).length, 35);
  assert.ok(Object.keys(icons.MARKETPLACE_PARENT_ILLUSTRATIONS).includes("home_garden_diy"));
  assert.equal(icons.MARKETPLACE_PARENT_ILLUSTRATIONS.home_garden, undefined, "legacy aliases are not new categories");
  for (const group of [icons.HOME_ILLUSTRATIONS, icons.ROOT_CATEGORY_ILLUSTRATIONS,
    icons.CATEGORY_GROUP_ILLUSTRATIONS, icons.SUBCATEGORY_ILLUSTRATIONS,
    icons.MARKETPLACE_PARENT_ILLUSTRATIONS, icons.MARKETPLACE_SUBCATEGORY_ILLUSTRATIONS,
    icons.SERVICE_MODULE_ILLUSTRATIONS]) {
    for (const asset of Object.values(group)) assert.ok(fs.existsSync(path.resolve(root, "lib", asset)), asset);
  }
});

test("mobility sprites select discrete 30-degree views with correct map cardinal orientation", () => {
  const icons = load("lib/mobilityViewSources.generated.ts");
  for (const kind of ["bus", "tram", "bus_stop"]) assert.equal(Object.keys(icons.MOBILITY_VIEW_SOURCES[kind]).length, 12);
  assert.deepEqual([0, 90, 180, 270].map(icons.vehicleMobilityViewAngle), [180, 270, 0, 90]);
  assert.deepEqual([0, 90, 180, 270].map(icons.stopMobilityViewAngle), [0, 90, 180, 270]);
  assert.equal(icons.vehicleMobilityViewAngle(359), 180);
  assert.equal(icons.vehicleMobilityViewAngle(44), 210);
  assert.ok(icons.vehicleMobilityView("bus", 0).includes("bus/180.png"));
  assert.ok(icons.vehicleMobilityView("tram", 90).includes("tram/270.png"));
  assert.ok(icons.stopMobilityView(90).includes("bus_stop/090.png"));
  for (const kind of ["bus", "tram", "bus_stop"]) for (const angle of Object.keys(icons.MOBILITY_VIEW_SOURCES[kind]))
    assert.ok(fs.existsSync(path.resolve(root, "lib", icons.MOBILITY_VIEW_SOURCES[kind][angle])));
  const web = fs.readFileSync(path.join(root, "components/BusinessMap.web.tsx"), "utf8");
  const native = fs.readFileSync(path.join(root, "components/BusinessMap.native.tsx"), "utf8");
  const visual = fs.readFileSync(path.join(root, "components/VisualTransitMarker.native.tsx"), "utf8");
  assert.match(web, /MOBILITY_VIEW_SOURCES\[kind\]\[viewAngle\]/);
  assert.match(web, /labelOrigin:/, "web route numbers use an upright marker label");
  assert.match(native, /stopMobilityView\(cameraHeading\)/);
  assert.match(visual, /segmentBearing\(points\[i\],points\[i\+1\]\)/, "native views follow each curved path segment");
});

test("category and module illustrations are wired into the requested existing selectors and cards",()=>{
  for(const file of ["components/city/CityGatewayScreen.tsx","components/locator/LocatorSidebar.tsx",
    "components/locator/LocatorHeader.tsx","app/(tabs)/locator.tsx","app/(auth)/register.tsx","app/(tabs)/profile.tsx","app/(tabs)/jobs.tsx",
    "app/services.tsx","app/(tabs)/home.tsx","components/marketplace/MarketplaceCategoryPicker.tsx",
    "components/marketplace/MarketplaceCategoryFilter.tsx","components/business/ServiceModal.tsx",
    "components/business/CategoryServiceCard.tsx","components/business/BookingListModal.tsx",
    "components/business/UserBookingListModal.tsx","components/business/ServiceSection.tsx"]){
    assert.match(fs.readFileSync(path.join(root,file),"utf8"),/IllustratedIcon|iconSource: illustratedIconSource/ ,file);
  }
  const locatorHeader=fs.readFileSync(path.join(root,"components/locator/LocatorHeader.tsx"),"utf8");
  assert.match(locatorHeader,/illustratedIconSource\("home", s\.key\)/);
  for(const key of ["hotels","businesses","events","activities"])assert.ok(locatorHeader.includes(`"${key}"`),`Locator ${key} icon`);
  const home=fs.readFileSync(path.join(root,"app/(tabs)/home.tsx"),"utf8");
  assert.doesNotMatch(home,/iconSource=\{illustratedIconSource\("home","events"\)/);
  assert.doesNotMatch(home,/iconSource=\{illustratedIconSource\("home","activities"\)/);
  const gateway=fs.readFileSync(path.join(root,"components/city/CityGatewayScreen.tsx"),"utf8");
  assert.match(gateway,/node\.id==="events" \|\| node\.id==="activities"\)return \{kind:"home",key:node\.id\}/);
  assert.match(gateway,/size=\{32\}/);
  assert.match(gateway,/visibleCategories = current \? \(current\.children \|\| \[\]\) : categories/);
});

test("the same English watercolor wordmark is wired to app, splash, favicon, share and PWA entry points", () => {
  const config = fs.readFileSync(path.join(root, "app.config.ts"), "utf8");
  const component = fs.readFileSync(path.join(root, "components/brand/PerixLogo.tsx"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.json"), "utf8"));
  assert.match(config, /perix-watercolor-app-icon\.png/);
  assert.match(config, /perix-watercolor-adaptive-icon\.png/);
  assert.match(config, /perix-watercolor-favicon\.png/);
  assert.match(config, /perix-watercolor-wordmark\.png/);
  assert.match(component, /perix-watercolor-wordmark\.png/);
  assert.doesNotMatch(component, /wordmark-el|useTranslation/);
  for (const item of manifest.icons) assert.ok(fs.existsSync(path.join(root, "public", item.src.split("?")[0].replace(/^\//, ""))));
  for (const file of ["user", "profile", "business", "event", "activity"])
    assert.match(fs.readFileSync(path.join(root, `app/share/${file}/[id].tsx`), "utf8"), /perix-watercolor-wordmark\.png/);
});
