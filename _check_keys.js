const fs = require('fs');
const path = require('path');

const locales = {};
['en', 'de', 'el'].forEach(locale => {
  const p = 'C:/Users/PC/Downloads/Perix1/Perix-main/frontend/i18n/locales/' + locale + '.json';
  locales[locale] = JSON.parse(fs.readFileSync(p, 'utf8'));
});

function flatten(obj, prefix) {
  const result = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? prefix + '.' + k : k;
    if (typeof v === 'object' && v !== null) {
      for (const sub of flatten(v, full)) result.add(sub);
    } else {
      result.add(full);
    }
  }
  return result;
}

const enKeys = flatten(locales.en, '');
const deKeys = flatten(locales.de, '');
const elKeys = flatten(locales.el, '');

const files = [];
function walk(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach(i => {
    if (i.name === 'node_modules' || i.name === '.git' || i.name === 'dist' || i.name === '.expo' || i.name === '__tests__') return;
    const f = path.join(d, i.name);
    i.isDirectory() ? walk(f) : (i.name.match(/\.(tsx|ts)$/) && !i.name.match(/\.d\.ts$/) ? files.push(f) : null);
  });
}
walk('C:/Users/PC/Downloads/Perix1/Perix-main/frontend');

const pattern = /t\((['"])([a-zA-Z0-9_.\-]+)\1/g;
const usedKeys = new Map();
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let m;
  pattern.lastIndex = 0;
  while ((m = pattern.exec(content)) !== null) {
    const key = m[2];
    const rel = path.basename(file);
    if (!usedKeys.has(key)) usedKeys.set(key, []);
    usedKeys.get(key).push(rel);
  }
}

const missingIn = { en: [], de: [], el: [] };
const namespaces = {};
for (const [key, files2] of usedKeys) {
  const ns = key.split('.')[0];
  if (!namespaces[ns]) namespaces[ns] = [];
  namespaces[ns].push(key);
  if (!enKeys.has(key)) missingIn.en.push(key);
  if (!deKeys.has(key)) missingIn.de.push(key);
  if (!elKeys.has(key)) missingIn.el.push(key);
}

console.log('=== MISSING FROM en.json ===');
missingIn.en.sort().forEach(k => console.log(k));
console.log('');
console.log('=== MISSING FROM de.json ===');
missingIn.de.sort().forEach(k => console.log(k));
console.log('');
console.log('=== MISSING FROM el.json ===');
missingIn.el.sort().forEach(k => console.log(k));
console.log('');
console.log('=== KEYS WITH FALLBACK TEXT ===');
const fallbackPattern = /t\((['"])([a-zA-Z0-9_.\-]+)\1\)\s*\|\|\s*['"]([^'"]*?)['"]/g;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  fallbackPattern.lastIndex = 0;
  let m;
  while ((m = fallbackPattern.exec(content)) !== null) {
    console.log(m[2] + ' || ' + m[3] + '  (' + path.basename(file) + ')');
  }
}
console.log('');
console.log('=== KEYS WITH DEFAULT VALUE ===');
const defaultPattern = /t\((['"])([a-zA-Z0-9_.\-]+)\1\s*,\s*['"]([^'"]*?)['"]/g;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  defaultPattern.lastIndex = 0;
  let m;
  while ((m = defaultPattern.exec(content)) !== null) {
    console.log(m[2] + ' = ' + m[3] + '  (' + path.basename(file) + ')');
  }
}
