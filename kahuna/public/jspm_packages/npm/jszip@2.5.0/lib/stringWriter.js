/* */ 
'use strict';
var utils = require('./utils');
var StringWriter = function() {
  this.data = [];
};
StringWriter.prototype = {
  append: function(input) {
    input = utils.transformTo("string", input);
    this.data.push(input);
  },
  finalize: function() {
    return this.data.join("");
  }
};
module.exports = StringWriter;
