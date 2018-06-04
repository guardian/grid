/* */ 
(function(Buffer) {
  'use strict';
  module.exports = function(data, encoding) {
    return new Buffer(data, encoding);
  };
  module.exports.test = function(b) {
    return Buffer.isBuffer(b);
  };
})(require('buffer').Buffer);
