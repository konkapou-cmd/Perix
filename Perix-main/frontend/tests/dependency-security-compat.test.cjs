/* global __dirname */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");

test("deepmerge retains arrays, clone:false, customMerge, symbols, Date and RegExp semantics", () => {
  const merge = require("deepmerge");
  const symbol = Symbol("metadata");
  const date = new Date("2026-11-03T00:00:00Z");
  const regex = /route/i;
  const a = { nested: { left: 1 }, list: [{ a: 1 }], date, regex, [symbol]: { n: 1 } };
  const b = { nested: { right: 2 }, list: [{ b: 2 }] };
  const value = merge(a, b);
  assert.deepEqual(value.nested, { left: 1, right: 2 });
  assert.deepEqual(value.list, [{ a: 1 }, { b: 2 }]);
  assert.notEqual(value.list[0], a.list[0]);
  assert.notEqual(value[symbol], a[symbol]);
  assert.equal(value.date, date);
  assert.equal(value.regex, regex);
  assert.equal(merge(a, {}, { clone: false }).list, a.list);
  assert.deepEqual(merge({ a: [1] }, { a: [2] }, { arrayMerge: (_, source) => source }), { a: [2] });
  assert.deepEqual(merge({ v: { a: 1 } }, { v: { b: 2 } }, {
    customMerge: key => key === "v" ? () => ({ custom: true }) : undefined,
  }), { v: { custom: true } });
  assert.deepEqual(merge.all([{ a: 1 }, { b: 2 }]), { a: 1, b: 2 });
});

test("deepmerge never invokes an inherited prototype setter in source OR target copies", () => {
  const merge = require("deepmerge");
  const payload = JSON.parse('{"__proto__":{"perixPolluted":true},"safe":1}');
  for (const result of [merge(payload, {}), merge(Object.create(null), payload),
    merge({ nested: payload }, { nested: {} }).nested]) {
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(result.perixPolluted, undefined);
    assert.equal(result.safe, 1);
    assert.equal({}.perixPolluted, undefined);
  }
});

test("minimatch remains callable and exposes modern named exports to CJS and ESM", async () => {
  const mm = require("minimatch");
  assert.equal(typeof mm, "function");
  assert.equal(mm("src/app.tsx", "**/*.tsx"), true);
  assert.equal(mm("src/.hidden.tsx", "**/*.tsx"), false);
  assert.equal(mm("src/.hidden.tsx", "**/*.tsx", { dot: true }), true);
  assert.equal(mm.defaults({ nocase: true })("APP.tsx", "app.*"), true);
  assert.deepEqual(mm.braceExpand("{bus,tram}.ts"), ["bus.ts", "tram.ts"]);
  assert.equal(new mm.Minimatch("**/*.ts").match("src/app.ts"), true);
  const esm = await import("minimatch");
  assert.equal(typeof esm.Minimatch, "function");
  assert.equal(esm.minimatch("bus.ts", "*.ts"), true);
});

test("both modern and legacy glob callers enumerate a real bounded fixture tree", async () => {
  const directory = fs.mkdtempSync(path.join(process.env.PERIX_TEST_TMPDIR || os.tmpdir(), "perix-glob-security-"));
  try {
    fs.mkdirSync(path.join(directory, "nested"));
    for (const name of ["a.ts", "b.tsx", "nested/c.ts", "nested/.hidden.ts"]) fs.writeFileSync(path.join(directory, name), "");
    const rootGlob = require("glob");
    assert.deepEqual(rootGlob.sync("**/*.ts", { cwd: directory, posix: true }).sort(), ["a.ts", "nested/c.ts"]);
    const legacy = createRequire(require.resolve("rimraf/package.json"))("glob");
    assert.deepEqual(legacy.sync("**/*.ts", { cwd: directory }).sort(), ["a.ts", "nested/c.ts"]);
    assert.deepEqual(await new Promise((resolve, reject) => legacy("**/*.ts", { cwd: directory },
      (error, matches) => error ? reject(error) : resolve(matches))), ["a.ts", "nested/c.ts"]);
    const streamMatches = [];
    const stream = new legacy.Glob("**/*.ts", { cwd: directory });
    stream.on("match", value => streamMatches.push(value));
    await new Promise((resolve, reject) => { stream.on("end", resolve); stream.on("error", reject); });
    assert.deepEqual(streamMatches.sort(), ["a.ts", "nested/c.ts"]);
    const aborted = new legacy.Glob("**/*", { cwd: directory });
    let matchesAfterAbort = 0;
    aborted.on("match", () => { matchesAfterAbort++; });
    aborted.abort();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(matchesAfterAbort, 0);
    assert.equal(aborted.aborted, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true }); // Exclusively owned mkdtemp fixture.
  }
});

test("image-size keeps callable, named, Buffer, path and asynchronous callback entry points", async () => {
  const sizeOf = require("image-size");
  const asset = path.join(__dirname, "../assets/images/prx-icon.png");
  assert.equal(typeof sizeOf, "function");
  assert.equal(sizeOf.imageSize, sizeOf);
  const bytes = fs.readFileSync(asset);
  const expected = sizeOf(bytes);
  assert.ok(expected.width > 0 && expected.height > 0);
  assert.deepEqual(sizeOf(asset), expected);
  assert.deepEqual(await new Promise((resolve, reject) => sizeOf(asset, (e, result) => e ? reject(e) : resolve(result))), expected);
  sizeOf.setConcurrency(4);
  try {
    sizeOf.disableFS(true);
    assert.throws(() => sizeOf(asset), TypeError);
    assert.deepEqual(sizeOf(bytes), expected);
    sizeOf.disableTypes(["png"]);
    assert.throws(() => sizeOf(bytes), TypeError);
  } finally {
    sizeOf.disableFS(false);
    sizeOf.disableTypes([]);
    sizeOf.setConcurrency(100);
  }
});

test("malformed image container sizes cannot trap the asset parser", () => {
  const script = `const size=require('image-size');const b=Buffer.alloc(16);
    b.write('icns');b.writeUInt32BE(16,4);b.write('ic07',8);
    try { size(b); } catch {} `;
  const result = spawnSync(process.execPath, ["-e", script], { cwd: path.join(__dirname, ".."), timeout: 5000, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test("uuid keeps default/v4 and legacy subpaths while rejecting undersized output buffers", () => {
  const uuid = require("uuid");
  assert.equal(typeof uuid, "function");
  assert.equal(uuid.validate(uuid()), true);
  assert.equal(uuid.version(uuid.v4()), 4);
  assert.equal(require("uuid/v4"), uuid.v4);
  assert.equal(uuid.v5("perix", uuid.v5.DNS), uuid.v5("perix", uuid.v5.DNS));
  for (const fn of [uuid.v3, uuid.v5]) assert.throws(() => fn("perix", fn.DNS, new Uint8Array(4)));
});
