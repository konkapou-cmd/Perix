const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../vercel.json"), "utf8"));

test("only apex and www hosts permanently redirect to the Railway app", () => {
  assert.equal(config.routes, undefined);
  assert.equal(config.redirects.length, 2);
  for (const host of ["perix.eu", "www.perix.eu"]) {
    const matches = config.redirects.filter((rule) => rule.has.every(
      (condition) => condition.type === "host" && new RegExp(condition.value).test(host)
    ));
    assert.equal(matches.length, 1);
    assert.equal(matches[0].source, "/:path*");
    assert.equal(matches[0].destination, "https://app.perix.eu/:path*");
    assert.equal(matches[0].permanent, true);
  }
  for (const host of ["app.perix.eu", "perix.vercel.app", "evilperix.eu", "perix.eu.example.com"]) {
    assert.ok(config.redirects.every((rule) => !new RegExp(rule.has[0].value).test(host)));
  }
});

test("existing media proxy, SPA fallback and cache headers remain configured", () => {
  assert.deepEqual(config.rewrites, [
    { source: "/api/mux-hls/:path*", destination: "https://backend-production-1968.up.railway.app/api/mux-hls/:path*" },
    { source: "/:path*", destination: "/index.html" },
  ]);
  assert.deepEqual(config.headers, [{
    source: "/((?!_expo/|favicon).*)",
    headers: [{ key: "Cache-Control", value: "no-store" }],
  }]);
});
