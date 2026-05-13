const fs = require('fs');
const path = require('path');
const files = [];
function walk(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach(i => {
    if (i.name === 'node_modules' || i.name === '.git' || i.name === 'dist' || i.name === '.expo' || i.name === '__tests__') return;
    const f = path.join(d, i.name);
    i.isDirectory() ? walk(f) : (i.name.match(/\.(tsx|ts)$/) && !i.name.match(/\.d\.ts$/) ? files.push(f) : null);
  });
}
walk('C:/Users/PC/Downloads/Perix1/Perix-main/frontend');
const p1 = /t\((['"])([a-zA-Z0-9_.\-]+)\1/g;
const keys = new Map();
const fallbacks = new Map();
const defaults = new Map();
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = p1.exec(content)) !== null) {
    const key = m[2];
    const rel = path.basename(file);
    if (!keys.has(key)) keys.set(key, new Set());
    keys.get(key).add(rel);
  }
  // Find fallback patterns: t("key") || "fallback"
  const fp = /t\((['"])([a-zA-Z0-9_.\-]+)\1\)\s*\|\|\s*['"]([^'"]*?)['"]/g;
  while ((m = fp.exec(content)) !== null) {
    const key = m[2];
    const fb = m[3];
    if (!fallbacks.has(key)) fallbacks.set(key, new Set());
    fallbacks.get(key).add(fb);
  }
  // Find default value patterns: t("key", "default")
  const dp = /t\((['"])([a-zA-Z0-9_.\-]+)\1\s*,\s*['"]([^'"]*?)['"]/g;
  while ((m = dp.exec(content)) !== null) {
    const key = m[2];
    const dv = m[3];
    if (!defaults.has(key)) defaults.set(key, new Set());
    defaults.get(key).add(dv);
  }
}
// Load locale files
['en', 'de', 'el'].forEach(locale => {
  const localePath = `C:/Users/PC/Downloads/Perix1/Perix-main/frontend/i18n/locales/${locale}.json`;
  try {
    const data = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    const existing = new Set();
    function flatten(obj, prefix) {
      for (const [k, v] of Object.entries(obj)) {
        const full = prefix ? prefix + '.' + k : k;
        if (typeof v === 'object' && v !== null) {
          flatten(v, full);
        } else {
          existing.add(full);
        }
      }
    }
    flatten(data, '');
    // Check each key
    for (const [key, files] of keys) {
      if (!existing.has(key)) {
        console.log(`MISSING:${locale}:${key} (${[...files].join(', ')})`);
      }
    }
  } catch(e) { console.error('Error loading ' + locale + ':', e.message); }
});
console.log('---KEYS_WITH_FALLBACKS---');
for (const [key, fbs] of fallbacks) {
  console.log(key + ' || ' + [...fbs].join(' | '));
}
console.log('---KEYS_WITH_DEFAULTS---');
for (const [key, dvs] of defaults) {
  console.log(key + ' = ' + [...dvs].join(' | '));
}
console.log('---ALL_KEYS_BY_NAMESPACE---');
const byNamespace = new Map();
for (const [key, files] of keys) {
  const ns = key.split('.')[0];
  if (!byNamespace.has(ns)) byNamespace.set(ns, []);
  byNamespace.get(ns).push(key);
}
for (const [ns, ks] of [...byNamespace.entries()].sort((a,b) => a[0].localeCompare(b[0]))) {
  for (const k of ks.sort()) {
    console.log(ns + ':' + k + ' (' + [...keys.get(k)].join(', ') + ')');
  }
}
