"use strict";

const fs = require("node:fs");
const path = require("node:path");
const modern = require("image-size-modern");
const fromFile = require("image-size-modern/fromFile");
const MAX_HEADER_BYTES = 512 * 1024; // Preserve v1's bounded synchronous read.
let disabledFS = false;

function imageSize(input, callback) {
  if (input instanceof Uint8Array) return modern.imageSize(input);
  if (typeof input !== "string" || disabledFS) {
    throw new TypeError("invalid invocation. input should be a Uint8Array");
  }
  const filename = path.resolve(input);
  if (typeof callback === "function") {
    fromFile.imageSizeFromFile(filename).then(
      size => process.nextTick(callback, null, size),
      error => process.nextTick(callback, error),
    );
    return;
  }
  const fd = fs.openSync(filename, "r");
  try {
    const size = fs.fstatSync(fd).size;
    if (size <= 0) throw new Error("Empty file");
    const header = new Uint8Array(Math.min(size, MAX_HEADER_BYTES));
    const length = fs.readSync(fd, header, 0, header.length, 0);
    return modern.imageSize(header.subarray(0, length));
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = imageSize;
module.exports.default = imageSize;
module.exports.imageSize = imageSize;
module.exports.disableFS = value => { disabledFS = value; };
module.exports.disableTypes = modern.disableTypes;
module.exports.setConcurrency = fromFile.setConcurrency;
module.exports.types = modern.types;
