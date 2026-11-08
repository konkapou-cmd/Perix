"use strict";

const { EventEmitter } = require("node:events");
const modern = require("glob-modern");

function sorted(matches, options) {
  return options.nosort ? matches : matches.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
function sync(pattern, options = {}) {
  return sorted(modern.globSync(pattern, { posix: true, ...options }), options);
}

// Legacy glob 7's walker inspects minimatch's old RegExp internals. It cannot
// safely be paired with minimatch 11's state-machine matchers. Delegate the
// walk too, retaining the callback/sync/event surfaces used by SDK 54 tools.
class LegacyGlob extends EventEmitter {
  constructor(pattern, options = {}, callback) {
    super();
    if (typeof options === "function") { callback = options; options = {}; }
    this.options = options;
    this.pattern = pattern;
    this.found = [];
    this.paused = false;
    this.aborted = false;
    this.controller = new AbortController();
    if (callback) {
      this.once("end", found => callback(null, found));
      this.once("error", callback);
    }
    setImmediate(() => this.walk().catch(error => {
      if (!this.aborted) this.emit("error", error);
    }));
  }
  async walk() {
    if (this.aborted) return;
    const signal = this.options.signal
      ? AbortSignal.any([this.options.signal, this.controller.signal]) : this.controller.signal;
    const walker = new modern.Glob(this.pattern, { posix: true, ...this.options, signal });
    for await (const item of walker.iterate()) {
      if (this.paused) await new Promise(resolve => this.once("resume", resolve));
      if (this.aborted) return;
      this.found.push(item);
      this.emit("match", item);
    }
    if (!this.aborted) this.emit("end", sorted(this.found, this.options));
  }
  pause() { this.paused = true; this.emit("pause"); return this; }
  resume() { this.paused = false; this.emit("resume"); return this; }
  abort() {
    if (!this.aborted) {
      this.aborted = true;
      this.controller.abort();
      this.resume();
      this.emit("abort");
    }
    return this;
  }
}
function glob(pattern, options, callback) {
  return new LegacyGlob(pattern, options, callback);
}
module.exports = glob;
module.exports.glob = glob;
module.exports.sync = sync;
module.exports.globSync = sync;
module.exports.Glob = LegacyGlob;
module.exports.GlobSync = class GlobSync {
  constructor(pattern, options) { this.found = sync(pattern, options); }
};
module.exports.hasMagic = modern.hasMagic;
