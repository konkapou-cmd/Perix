const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, 'perix-sparse-realtime-release');
const source = fs.readFileSync(path.join(root, 'frontend-source/components/BusinessMap.web.tsx'), 'utf8');
const ts = require(path.join(root, 'frontend-source/node_modules/typescript'));
const ast = ts.createSourceFile('map.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let update;
function visit(node) {
  if (ts.isIfStatement(node) && node.expression.getText(ast) === 'existing'
      && node.thenStatement.getText(ast).includes('estimateCorrected')) update = node.thenStatement.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast); assert.ok(update);
const js = ts.transpileModule('(function(){' + update + '})()', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const points = [{ latitude: 52, longitude: 11 }, { latitude: 52.01, longitude: 11 }];
function check(estimated, oldRevision, newRevision, expectedReset) {
  let positions = 0;
  const marker = { setPosition() { positions++; }, setIcon() {}, setOpacity() {} };
  const rec = { journeyId: 'dated:T', path: points, estimateRevision: oldRevision,
    progNow: 200, progFrom: 200, progTo: 220, animStart: 1000, marker };
  const rep = { id: 'same-source', journeyId: 'dated:T', path: points, estimated,
    progressM: 50, estimateRevision: newRevision, type: 'tram', label: '9', latitude: 52, longitude: 11 };
  const records = [];
  vm.runInNewContext(js, { existing: rec, rep, polylineCumulative: () => [0, 1110],
    pointAtProgress: () => ({ lat: 52, lng: 11 }), vScale: 0.5,
    setVehicleTarget: target => { assert.equal(target.progNow, expectedReset ? 50 : 200); },
    Date: { now: () => 2000 }, makeVehicleIcon: () => ({}), google: {}, markersRef: { current: records } });
  assert.equal(positions, expectedReset ? 1 : 0);
  assert.equal(rec.marker, marker); assert.equal(records[0], rec);
  assert.equal(rec.estimateRevision, estimated ? newRevision : null);
  if (expectedReset) { assert.equal(rec.animStart, null); assert.equal(rec.progTo, null); }
}
check(true, 'epoch:old', 'epoch:corrected', true);
check(true, 'epoch:same', 'epoch:same', false);
check(false, null, 'virtual-token-must-not-reset-gps', false);
const result = { actual_home_update_branch_executed: true, explicit_virtual_revision_resets: true,
  same_revision_does_not_reset: true, gps_does_not_reset: true, marker_identity_preserved: true };
fs.writeFileSync(path.join(root, 'home-correction-verification.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
