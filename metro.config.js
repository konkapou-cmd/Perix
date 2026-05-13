// metro.config.js - minimal
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];

config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Patch .js.flow files
const reactNativeSrc = path.join(__dirname, 'node_modules/react-native/src');
const rndevtoolsDir = path.join(reactNativeSrc, 'private/devsupport/rndevtools');
const rndevtoolsFiles = fs.existsSync(rndevtoolsDir) ? fs.readdirSync(rndevtoolsDir) : [];
rndevtoolsFiles.forEach(file => {
  if (file.endsWith('.js.flow')) {
    const jsFile = file.replace('.js.flow', '.js');
    const jsPath = path.join(rndevtoolsDir, jsFile);
    if (!fs.existsSync(jsPath)) {
      fs.writeFileSync(jsPath, '// @flow\nmodule.exports = {};\n');
    }
  }
});

config.resolver.sourceExts = ['js.flow', ...config.resolver.sourceExts];

module.exports = config;
