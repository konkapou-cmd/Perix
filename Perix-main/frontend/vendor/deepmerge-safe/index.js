/*
 * Derived from deepmerge 4.3.1 dist/cjs.js (MIT; see LICENSE).
 * PERIX backport for GHSA-gcqx-w48m-w2h4: all writes to the newly created
 * destination use own data properties, never inherited __proto__ setters.
 * The upstream merge/clone/customMerge/arrayMerge policy is otherwise retained.
 */
"use strict";

var isMergeableObject = function (value) {
  return !!value && typeof value === "object" && !isSpecial(value);
};
function isSpecial(value) {
  var stringValue = Object.prototype.toString.call(value);
  return stringValue === "[object RegExp]" || stringValue === "[object Date]" || isReactElement(value);
}
var canUseSymbol = typeof Symbol === "function" && Symbol.for;
var REACT_ELEMENT_TYPE = canUseSymbol ? Symbol.for("react.element") : 0xeac7;
function isReactElement(value) { return value.$$typeof === REACT_ELEMENT_TYPE; }
function emptyTarget(value) { return Array.isArray(value) ? [] : {}; }
function cloneUnlessOtherwiseSpecified(value, options) {
  return options.clone !== false && options.isMergeableObject(value)
    ? deepmerge(emptyTarget(value), value, options) : value;
}
function defaultArrayMerge(target, source, options) {
  return target.concat(source).map(function (element) { return cloneUnlessOtherwiseSpecified(element, options); });
}
function getMergeFunction(key, options) {
  if (!options.customMerge) return deepmerge;
  var customMerge = options.customMerge(key);
  return typeof customMerge === "function" ? customMerge : deepmerge;
}
function getEnumerableOwnPropertySymbols(target) {
  return Object.getOwnPropertySymbols ? Object.getOwnPropertySymbols(target).filter(function (symbol) {
    return Object.propertyIsEnumerable.call(target, symbol);
  }) : [];
}
function getKeys(target) { return Object.keys(target).concat(getEnumerableOwnPropertySymbols(target)); }
function propertyIsOnObject(object, property) {
  try { return property in object; } catch (_) { return false; }
}
function propertyIsUnsafe(target, key) {
  return propertyIsOnObject(target, key)
    && !(Object.hasOwnProperty.call(target, key) && Object.propertyIsEnumerable.call(target, key));
}
function defineOwn(destination, key, value) {
  Object.defineProperty(destination, key, { value: value, enumerable: true, writable: true, configurable: true });
}
function mergeObject(target, source, options) {
  var destination = {};
  if (options.isMergeableObject(target)) {
    getKeys(target).forEach(function (key) {
      defineOwn(destination, key, cloneUnlessOtherwiseSpecified(target[key], options));
    });
  }
  getKeys(source).forEach(function (key) {
    if (propertyIsUnsafe(target, key)) return;
    if (propertyIsOnObject(target, key) && options.isMergeableObject(source[key])) {
      defineOwn(destination, key, getMergeFunction(key, options)(target[key], source[key], options));
    } else {
      defineOwn(destination, key, cloneUnlessOtherwiseSpecified(source[key], options));
    }
  });
  return destination;
}
function deepmerge(target, source, options) {
  options = options || {};
  options.arrayMerge = options.arrayMerge || defaultArrayMerge;
  options.isMergeableObject = options.isMergeableObject || isMergeableObject;
  options.cloneUnlessOtherwiseSpecified = cloneUnlessOtherwiseSpecified;
  var sourceIsArray = Array.isArray(source);
  if (sourceIsArray !== Array.isArray(target)) return cloneUnlessOtherwiseSpecified(source, options);
  return sourceIsArray ? options.arrayMerge(target, source, options) : mergeObject(target, source, options);
}
deepmerge.all = function (array, options) {
  if (!Array.isArray(array)) throw new Error("first argument should be an array");
  return array.reduce(function (prev, next) { return deepmerge(prev, next, options); }, {});
};
module.exports = deepmerge;
