/* global __dirname */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../components/stories/CityAdViewer.tsx"), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
}).outputText;

function stylesFor(platform) {
  let styles;
  const dependencies = {
    "react-native": {
      Platform: { OS: platform },
      Dimensions: { get: () => ({ width: 390, height: 844 }) },
      StyleSheet: { absoluteFillObject: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
        create: value => { styles = value; return value; } },
    },
    "../../lib/designTokens": {
      COLORS: { primary: "#123456" }, FONT_SIZES: { bodyLarge: 18 }, FONT_WEIGHTS: { semibold: "600" },
    },
    "../../lib/constants/mediaLimits": { MEDIA_LIMITS: { cityAd: { imageDisplayMs: 5000, maxDurationSeconds: 30 } } },
  };
  vm.runInNewContext(javascript, { exports: {}, require: name => dependencies[name] || {} });
  return styles;
}

test("CityAd web viewer keeps its fixed viewport overlay and full-size media", () => {
  const styles = stylesFor("web");
  assert.equal(styles.container.position, "fixed");
  for (const edge of ["top", "right", "bottom", "left"]) assert.equal(styles.container[edge], 0);
  assert.equal(styles.content.width, "100%");
  assert.equal(styles.content.height, "100%");
  assert.equal(styles.content.maxWidth, 1280);
  assert.equal(styles.media.width, "100%");
  assert.equal(styles.media.height, "100%");
});

for (const platform of ["ios", "android"]) {
  test(`CityAd ${platform} retains native absolute positioning`, () => {
    const styles = stylesFor(platform);
    assert.equal(styles.container.position, "absolute");
    for (const edge of ["top", "right", "bottom", "left"]) assert.equal(styles.container[edge], 0);
  });
}

test("the web-only type boundary does not suppress checking the viewer or its images", () => {
  assert.doesNotMatch(source, /@ts-(?:ignore|nocheck)|as any/);
  assert.match(source, /Platform\.OS === "web" \? \("fixed" as ViewStyle\["position"\]\) : "absolute"/);
  assert.equal((source.match(/style=\{styles\.media\}/g) || []).length, 4);
});
