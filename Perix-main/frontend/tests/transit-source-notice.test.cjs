/* global __dirname */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

test("both web map screens expose source terms without relabeling estimates as GPS", () => {
  const root = path.join(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "components/city/TransitSourceNotice.tsx"), "utf8");
  for (const language of ["en","de","el","es","fr","it","sq","pl","sr","ru"]) {
    assert.match(source, new RegExp(`\\b${language}:`));
  }
  assert.match(source, /BACKEND_URL.*data-sources/);
  assert.match(source, /OpenStreetMap contributors/);
  assert.match(source, /accessibilityRole="link"/);
  assert.match(fs.readFileSync(path.join(root,"components/city/CityGatewayScreen.tsx"),"utf8"), /<TransitSourceNotice/);
  assert.match(fs.readFileSync(path.join(root,"components/locator/LegacyLocatorScreen.tsx"),"utf8"), /<TransitSourceNotice osm=\{hasOsmTransitRouting\(transitMapLines\)\}/);
});
