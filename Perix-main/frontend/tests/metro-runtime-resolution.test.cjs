const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { resolve } = require("metro-resolver");
const config = require("../metro.config.js");

const webRoot = path.dirname(require.resolve("react-native-web/package.json"));
const context = {
  ...config.resolver,
  assetExts: new Set(config.resolver.assetExts),
  mainFields: config.resolver.resolverMainFields,
  originModulePath: path.join(webRoot, "dist/modules/AccessibilityUtil/index.js"),
  preferNativePlatform: false,
  redirectModulePath: (modulePath) => modulePath,
  getPackageForModule: () => null,
  fileSystemLookup(filePath) {
    if (!fs.existsSync(filePath)) return { exists: false };
    return {
      exists: true,
      type: fs.statSync(filePath).isDirectory() ? "d" : "f",
      realPath: fs.realpathSync(filePath),
    };
  },
  doesFileExist: (filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile(),
};

test("React Native Web imports resolve runtime JavaScript, not Flow declarations", () => {
  for (const moduleName of [
    "./isDisabled",
    "./propsToAccessibilityComponent",
    "./propsToAriaRole",
    "../createDOMProps/index",
    "../../exports/StyleSheet/index",
  ]) {
    const expected = path.resolve(path.dirname(context.originModulePath), `${moduleName}.js`);
    assert.ok(fs.existsSync(`${expected}.flow`), `${moduleName} has a competing Flow file`);
    const result = resolve(context, moduleName, "web");
    assert.equal(result.type, "sourceFile");
    assert.equal(result.filePath, fs.realpathSync(expected));
  }
});

test("the Agora stub and normal native JavaScript resolution are preserved", () => {
  assert.deepEqual(resolve(context, "react-native-agora", "web"), { type: "empty" });
  const result = resolve(context, "./isDisabled", "android");
  assert.equal(result.filePath, fs.realpathSync(path.join(webRoot, "dist/modules/AccessibilityUtil/isDisabled.js")));
});
