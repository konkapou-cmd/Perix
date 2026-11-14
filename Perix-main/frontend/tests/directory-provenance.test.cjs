/* global __dirname */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const module = { exports };
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020,
  } }).outputText, { exports, module, require: name => dependencies[name], console, ...globals });
  return module.exports;
}

test("map shows hybrid 3D satellite with locked tilt and Cloud-owned POI styling", () => {
  const source = read("components/BusinessMap.web.tsx");
  assert.match(source, /mapTypeId: "hybrid"/);
  assert.match(source, /mapId: PERIX_VECTOR_MAP_ID/);
  assert.match(source, /tilt: LOCKED_MAP_TILT/);
  assert.doesNotMatch(source, /WebGLOverlayView|Perix3DLayer|import\(["']three["']\)/);
  // No inline `styles`: with a vector mapId they are ignored — POI/transit
  // hiding and the Perix palette live in the Cloud console style.
  assert.doesNotMatch(source, /featureType: 'poi'/);
  assert.match(source, /zoomControl: !staticMode/);
});

test("directory results carry only Perix-entered identities", async () => {
  const gateway = load("lib/city/gateway.ts", {
    "../api/core": { apiRequest: async url => {
      if (url.includes("/public-directory/business")) return { items: [{ id: "biz_001", title: "Shop" }], next_cursor: null };
      return { items: [], next_cursor: null };
    } },
    "../api/events": {}, "../marketplace/marketplaceTaxonomy": { MARKETPLACE_CATEGORIES: [] },
    "../config/serviceModules": { SERVICE_MODULES: [] }, "../fieldRegistry": { FIELD_REGISTRY: { property_type: { options: [] } } },
    "./publicServices": { getPublicServices: async () => ({ items: [
      { service_id: "ps_abcd1234abcd1234abcd1234", name: "Office", address: null, latitude: 52.14, longitude: 11.63, description_el: "d" },
    ], next_cursor: null }) },
    "../api/mobility": { getLiveVehicles: async () => [], getTransitStops: async () => [] },
  });
  const bounds = { minLat: 52, maxLat: 53, minLng: 11, maxLng: 12 };
  const page = await gateway.fetchGatewayPage({ kinds: ["business"], publicOnly: true }, bounds, "", {}, false,
    [{ countryCode: "DE", cityId: "de-magdeburg" }]);
  assert.ok(page.items.length > 0);
  for (const item of page.items) {
    assert.ok(item.type && item.id, `anonymous entry: ${JSON.stringify(item).slice(0, 80)}`);
    if (item.type === "public_service") assert.match(item.id, /^ps_[a-f0-9]{24}$/);
  }
});
