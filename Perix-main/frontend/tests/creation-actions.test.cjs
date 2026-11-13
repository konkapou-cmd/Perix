/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { test } = require("node:test");
const root = path.join(__dirname, "..");

function load(relative) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(javascript, { exports, require: (name) => name });
  return exports;
}

test("creation resolver maps plan entitlements to allowed actions (v18)", () => {
  const mod = load("lib/creation/creationActions.ts");
  const { resolveCreationActions, isArtistDeprecated } = mod;

  const free = resolveCreationActions("user", { effective_plan: "free_user" });
  assert.equal(free.find((a) => a.key === "post")?.allowed, true);
  const freeProduct = free.find((a) => a.key === "product");
  assert.equal(freeProduct?.allowed, true);
  assert.equal(freeProduct?.kindOverride, "classified_ad", "free users publish a classified ad");
  assert.equal(free.find((a) => a.key === "activity")?.allowed, false);
  assert.equal(free.find((a) => a.key === "activity")?.reasonCode, "plan_required");
  assert.equal(free.find((a) => a.key === "home_rental")?.reasonCode, "plan_required");

  const premium = resolveCreationActions("user", { effective_plan: "premium_user" });
  assert.equal(premium.find((a) => a.key === "product")?.kindOverride ?? null, null);
  assert.equal(premium.find((a) => a.key === "activity")?.allowed, true);
  assert.equal(premium.find((a) => a.key === "home_rental")?.allowed, true);

  const business = resolveCreationActions("business", { effective_plan: "business" });
  assert.deepEqual(
    JSON.parse(JSON.stringify(business.filter((a) => a.allowed).map((a) => a.key))),
    ["product", "service", "event", "job"],
  );

  // Missing snapshot keeps legacy-friendly defaults (free plan for users).
  const defaults = resolveCreationActions("user");
  assert.equal(defaults.find((a) => a.key === "activity")?.reasonCode, "plan_required");

  assert.equal(isArtistDeprecated("artist"), true);
  assert.equal(isArtistDeprecated("user"), false);
  assert.equal(isArtistDeprecated(undefined), false);
});
