/* Static configuration inspection only: no app, network, or database startup. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const frontend = path.join(root, 'frontend');
const ts = require(path.join(frontend, 'node_modules/typescript'));
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const exports = {};
  cache.set(relative, exports);
  const source = fs.readFileSync(path.join(frontend, relative), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(javascript, { exports, require: (name) => {
    if (name === './serviceModules') return load('lib/config/serviceModules.ts');
    if (name === '@expo/vector-icons') return { Ionicons: { glyphMap: {} } };
    if (name.endsWith('.webp')) return name;
    throw new Error(`Unexpected dependency: ${name}`);
  } }, { timeout: 5000 });
  return exports;
}
const modules = load('lib/config/serviceModules.ts');
const glyphPath = path.join(frontend, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');
console.log(JSON.stringify({
  categories: load('lib/marketplace/marketplaceTaxonomy.ts').MARKETPLACE_CATEGORIES,
  matrix: load('lib/config/serviceCategoryMatrix.ts').SERVICE_CATEGORY_MATRIX,
  modules: modules.SERVICE_MODULES,
  modes: Object.fromEntries(Object.keys(modules.SERVICE_MODULES).map(key => [key, modules.getBookingMode(key)])),
  illustrations: load('lib/illustrationSources.generated.ts'),
  glyphs: fs.existsSync(glyphPath) ? Object.keys(JSON.parse(fs.readFileSync(glyphPath, 'utf8'))) : null,
}));
