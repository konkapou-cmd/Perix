"use strict";

const modern = require("minimatch-modern");
// Older glob/tooling calls require('minimatch') directly. Newer consumers
// destructure named exports. Explicit assignments also expose named CJS
// exports to Node's ESM loader; do not replace them with dynamic copying.
module.exports = modern.minimatch;
module.exports.minimatch = modern.minimatch;
module.exports.Minimatch = modern.Minimatch;
module.exports.AST = modern.AST;
module.exports.GLOBSTAR = modern.GLOBSTAR;
module.exports.filter = modern.filter;
module.exports.defaults = modern.defaults;
module.exports.braceExpand = modern.braceExpand;
module.exports.makeRe = modern.makeRe;
module.exports.match = modern.match;
module.exports.escape = modern.escape;
module.exports.unescape = modern.unescape;
module.exports.sep = modern.sep;
