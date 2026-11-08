"use strict";

// Expo Router 6 and React Navigation 7 import the CommonJS namespace of v7.
// Delegate to the patched upstream parser, not the vulnerable v7 decoder.
const modern = require("query-string-modern").default;
// Literal named assignments preserve ESM namespace imports as well as CJS.
module.exports.extract = modern.extract;
module.exports.parse = modern.parse;
module.exports.stringify = modern.stringify;
module.exports.parseUrl = modern.parseUrl;
module.exports.stringifyUrl = modern.stringifyUrl;
module.exports.pick = modern.pick;
module.exports.exclude = modern.exclude;
