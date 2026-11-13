const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(
  root, 'assets/illustrations/sources/catalog196-mask-manifest.json'), 'utf8'));

test('catalog-196 install preserves every reviewed mask byte-for-byte', () => {
  assert.equal(manifest.icons.length, 196);
  let installed = 0;
  for (const row of manifest.icons) {
    if (row.kind === 'skip') continue;
    const file = path.join(root, 'assets/illustrations', row.target);
    assert.ok(fs.existsSync(file), row.target);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(digest, row.sha256, row.target);
    installed++;
  }
  assert.equal(installed, 195);
});

test('jobs and singular rentals keys resolve to real catalog artwork', () => {
  const source = fs.readFileSync(path.join(root, 'lib/illustrationSources.generated.ts'), 'utf8');
  for (const key of ['Vollzeit', 'Teilzeit', 'Vertrag', 'Praktikum', 'Remote',
    'apartment', 'house', 'studio', 'room', 'commercial']) {
    assert.match(source, new RegExp(`"${key}": require\\("..\\/assets\\/illustrations\\/categories\\/sub\\/${key}\\.webp"\\)`), key);
    assert.ok(fs.existsSync(path.join(root, 'assets/illustrations/categories/sub', key + '.webp')), key);
  }
  const gateway = fs.readFileSync(path.join(root, 'components/city/CityGatewayScreen.tsx'), 'utf8');
  assert.match(gateway, /if\(node\.query\.job_type\)return \{kind:"job-type",key:node\.query\.job_type\}/);
});

test('pet-hotel stays uninstalled: no slug exists, nothing invented', () => {
  const rows = manifest.icons.filter(row => row.kind === 'skip');
  assert.deepEqual(rows.map(row => row.key), ['pet-hotel']);
  assert.ok(!fs.existsSync(path.join(root, 'assets/illustrations/categories/sub/pet-hotel.webp')));
});
