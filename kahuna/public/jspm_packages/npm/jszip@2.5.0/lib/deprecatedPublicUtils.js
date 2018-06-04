/* */ 
'use strict';
var utils = require('./utils');
exports.string2binary = function(str) {
  return utils.string2binary(str);
};
exports.string2Uint8Array = function(str) {
  return utils.transformTo("uint8array", str);
};
exports.uint8Array2String = function(array) {
  return utils.transformTo("string", array);
};
exports.string2Blob = function(str) {
  var buffer = utils.transformTo("arraybuffer", str);
  return utils.arrayBuffer2Blob(buffer);
};
exports.arrayBuffer2Blob = function(buffer) {
  return utils.arrayBuffer2Blob(buffer);
};
exports.transformTo = function(outputType, input) {
  return utils.transformTo(outputType, input);
};
exports.getTypeOf = function(input) {
  return utils.getTypeOf(input);
};
exports.checkSupport = function(type) {
  return utils.checkSupport(type);
};
exports.MAX_VALUE_16BITS = utils.MAX_VALUE_16BITS;
exports.MAX_VALUE_32BITS = utils.MAX_VALUE_32BITS;
exports.pretty = function(str) {
  return utils.pretty(str);
};
exports.findCompression = function(compressionMethod) {
  return utils.findCompression(compressionMethod);
};
exports.isRegExp = function(object) {
  return utils.isRegExp(object);
};
