"use strict";

const modern = require("uuid-modern");
// Preserve old callable v4/default and named consumers without retaining the
// old implementations or their unchecked output-buffer writes.
module.exports = modern.v4;
module.exports.v1 = modern.v1;
module.exports.v3 = modern.v3;
module.exports.v4 = modern.v4;
module.exports.v5 = modern.v5;
module.exports.v6 = modern.v6;
module.exports.v7 = modern.v7;
module.exports.v1ToV6 = modern.v1ToV6;
module.exports.v6ToV1 = modern.v6ToV1;
module.exports.validate = modern.validate;
module.exports.version = modern.version;
module.exports.parse = modern.parse;
module.exports.stringify = modern.stringify;
module.exports.NIL = modern.NIL;
module.exports.MAX = modern.MAX;
