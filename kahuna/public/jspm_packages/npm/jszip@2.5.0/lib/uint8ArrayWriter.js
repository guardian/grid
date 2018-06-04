/* */ 
'use strict';
var utils = require('./utils');
var Uint8ArrayWriter = function(length) {
  this.data = new Uint8Array(length);
  this.index = 0;
};
Uint8ArrayWriter.prototype = {
  append: function(input) {
    if (input.length !== 0) {
      input = utils.transformTo("uint8array", input);
      this.data.set(input, this.index);
      this.index += input.length;
    }
  },
  finalize: function() {
    return this.data;
  }
};
module.exports = Uint8ArrayWriter;
