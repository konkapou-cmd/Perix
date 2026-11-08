/* global __dirname */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const query = require("query-string");

const plain = value => JSON.parse(JSON.stringify(value));

test("the router's query-string namespace retains all seven legacy entry points", () => {
  for (const name of ["extract", "parse", "stringify", "parseUrl", "stringifyUrl", "pick", "exclude"]) {
    assert.equal(typeof query[name], "function", name);
  }
});

test("ESM namespace imports used by React Navigation expose the same functions", async () => {
  const esm = await import("query-string");
  assert.equal(esm.parse, query.parse);
  assert.equal(esm.stringify, query.stringify);
});

test("actual React Navigation core round-trips locator and entity links", async () => {
  const directory = path.dirname(require.resolve("@react-navigation/core"));
  const { getPathFromState } = await import(pathToFileURL(path.join(directory, "getPathFromState.js")).href);
  const { getStateFromPath } = await import(pathToFileURL(path.join(directory, "getStateFromPath.js")).href);
  const options = { screens: { Locator: "locator", Business: "business/:id" } };
  const route = { name: "Locator", params: { tab: "mobility", q: "Αγορά", tag: ["bus", "tram"] } };
  const url = getPathFromState({ routes: [route] }, options);
  const restored = getStateFromPath(url, options).routes[0];
  assert.equal(restored.name, route.name);
  assert.deepEqual(restored.params, route.params);
  assert.equal(getPathFromState({ routes: [{ name: "Business", params: { id: "b_123" } }] }, options), "/business/b_123");
});

test("Greek text, repeated parameters, plus signs, nulls and empty strings retain their meanings", () => {
  assert.deepEqual(plain(query.parse("route=6&label=%CE%91%CE%93%CE%9F%CE%A1%CE%91&empty=&flag")),
    { empty: "", flag: null, label: "ΑΓΟΡΑ", route: "6" });
  assert.deepEqual(plain(query.parse("tag=bus&tag=tram&space=a+b&plus=a%2Bb")),
    { plus: "a+b", space: "a b", tag: ["bus", "tram"] });
  assert.equal(query.stringify({ tab: "mobility", q: "Αγορά + cafés", unset: undefined,
    empty: "", flag: null, tag: ["bus", "tram"] }),
    "empty=&flag&q=%CE%91%CE%B3%CE%BF%CF%81%CE%AC%20%2B%20caf%C3%A9s&tab=mobility&tag=bus&tag=tram");
});

test("router URLs preserve query merging and fragment identifiers", () => {
  assert.deepEqual(plain(query.parseUrl("/locator?tab=mobility&route=N8#map", { parseFragmentIdentifier: true })),
    { url: "/locator", query: { route: "N8", tab: "mobility" }, fragmentIdentifier: "map" });
  assert.equal(query.stringifyUrl({ url: "/app?tab=all#old", query: { tab: "mobility", q: "A B" },
    fragmentIdentifier: "map" }), "/app?q=A%20B&tab=mobility#map");
  assert.equal(query.pick("/app?a=1&b=2#map", ["a"]), "/app?a=1#map");
  assert.equal(query.exclude("/app?a=1&b=2#map", ["a"]), "/app?b=2#map");
});

test("array formats, opt-in number/boolean parsing and decode:false remain compatible", () => {
  assert.equal(query.stringify({ a: ["x", "y"], empty: [], n: null }, { arrayFormat: "bracket" }), "a[]=x&a[]=y&n");
  assert.deepEqual(plain(query.parse("a[]=x&a[]=y&n", { arrayFormat: "bracket" })), { a: ["x", "y"], n: null });
  assert.deepEqual(plain(query.parse("n=001&f=false", { parseNumbers: true, parseBooleans: true })), { f: false, n: 1 });
  assert.deepEqual(plain(query.parse("q=%CE%91+bus", { decode: false })), { q: "%CE%91+bus" });
});

test("query parsing never creates a prototype from attacker-controlled keys", () => {
  const parsed = query.parse("__proto__=x&constructor=y&n=001&f=false");
  assert.equal(Object.getPrototypeOf(parsed), null);
  assert.equal(parsed.__proto__, "x");
  assert.equal(parsed.constructor, "y");
  assert.equal({}.polluted, undefined);
});

test("long malformed percent-encoding is decoded in a bounded child process", () => {
  const script = `const q=require('query-string');
    const input='q='+('%C2'.repeat(20000))+'%G0';
    const result=q.parse(input);if(typeof result.q!=='string')process.exit(2);`;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.join(__dirname, ".."), timeout: 5000, encoding: "utf8",
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
