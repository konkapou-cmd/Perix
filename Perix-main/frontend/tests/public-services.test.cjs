/* global __dirname */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "..");

function loadAdapter() {
  const calls = [];
  const code = ts.transpileModule(fs.readFileSync(path.join(root, "lib/city/publicServices.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, URLSearchParams, require: () => ({ apiRequest: (...args) => { calls.push(args); return Promise.resolve({ items: [], next_cursor: null }); } }) });
  return { adapter: exports, calls };
}

test("directory API uses only Perix GET reads, canonical filters and paging", async () => {
  const { adapter, calls } = loadAdapter();
  await adapter.getPublicServices({ countryCode: "DE", cityId: "de-magdeburg", categoryId: "ps:health:hospitals", bounds: adapter.MAGDEBURG_BOUNDS, cursor: "ps_123", q: "Klinikum" });
  const [url, method, token] = calls[0];
  assert.equal(method, "GET"); assert.equal(token, undefined);
  assert.ok(url.startsWith("/public-services?"));
  const params = new URLSearchParams(url.split("?")[1]);
  assert.equal(params.get("category_id"), "ps:health:hospitals");
  assert.equal(params.get("city_id"), "de-magdeburg");
  assert.equal(params.get("min_lat"), "52.06");
  assert.equal(params.get("cursor"), "ps_123");
  assert.equal(params.get("include_unlocated"), "true");
});

test("markers are derived from the same records, exclude missing/invalid coordinates", () => {
  const { adapter } = loadAdapter();
  const rows = [
    { service_id: "a", name: "A", latitude: 52.1, longitude: 11.6 },
    { service_id: "b", name: "B", latitude: null, longitude: null },
    { service_id: "c", name: "C", latitude: NaN, longitude: 11.6 },
  ];
  const markers = adapter.publicServiceMarkers(rows);
  assert.equal(markers.length, 1); assert.equal(markers[0].id, "a");
  assert.equal(markers[0].latitude, rows[0].latitude);
});

test("shared Gateway result merge preserves distinct entity types and deduplicates IDs", () => {
  const { adapter } = loadAdapter();
  const existing = [{ id: "a", type: "business" }, { id: "a", type: "business" }];
  const merged = adapter.mergeCityResults(existing, [{ service_id: "a" }, { service_id: "a" }]);
  assert.equal(merged.length, 2);
  assert.deepEqual(Array.from(merged, item => item.type), ["business", "public_service"]);
});

test("explorer composes existing map without routing to Locator or mutation controls", () => {
  const source = fs.readFileSync(path.join(root, "components/city/CityGatewayScreen.tsx"), "utf8");
  assert.match(source, /import BusinessMap from "\.\.\/BusinessMap"/);
  assert.match(source, /markers=\{markers\}/);
  assert.match(source, /discovery\.items\.map/);
  assert.doesNotMatch(source, /\/locator|useHomeTransit|setGlobalMapBounds/);
  assert.doesNotMatch(source.match(/<BusinessMap[\s\S]*?\/>/)[0], /\bkey=/);
  assert.match(source, /setPath\(path\.slice\(0, -1\)\)/);
});

test("root and app share one screen; Home is protected without blocking public entity reads", () => {
  assert.match(fs.readFileSync(path.join(root, "app/index.tsx"), "utf8"), /components\/city\/CityGatewayScreen/);
  assert.match(fs.readFileSync(path.join(root, "app/app.tsx"), "utf8"), /components\/city\/CityGatewayScreen/);
  const layout = fs.readFileSync(path.join(root, "app/_layout.tsx"), "utf8");
  const publicTab = layout.match(/const isPublicTab =[\s\S]*?;/)[0];
  assert.doesNotMatch(publicTab, /home/);
  assert.match(layout, /isPublicEntity/);
  assert.match(layout, /\[user, loading, segments\]/);
});

test("member detail components never mount for guests", () => {
  const route = fs.readFileSync(path.join(root, "components/city/GuestEntityRoute.tsx"), "utf8");
  assert.match(route, /if \(user\) return <>\{children\}<\/>/);
  assert.match(route, /PublicEntityLoader/);
  for (const kind of ["business", "event", "activity", "artist", "user", "job", "service", "rental", "listing", "post"]) {
    assert.match(fs.readFileSync(path.join(root, `app/${kind}/[id].tsx`), "utf8"), new RegExp(`<GuestEntityRoute kind="${kind}"`));
  }
});

test("detail card displays real source age, licences and modifications; has no social actions", () => {
  const source = fs.readFileSync(path.join(root, "components/city/PublicServiceCard.tsx"), "utf8");
  for (const field of ["source_published_at", "source_last_updated_at", "data_collected_at", "source_license_url", "modifications", "source_credits_url"]) assert.ok(source.includes(field));
  assert.doesNotMatch(source, /Date\.now|new Date|trackProfileView|toggleLike|booking|favorite|follow|POST|PATCH|DELETE/);
});
