/* */ 
'use strict';
var base64 = require('./base64');
function JSZip(data, options) {
  if (!(this instanceof JSZip))
    return new JSZip(data, options);
  this.files = {};
  this.comment = null;
  this.root = "";
  if (data) {
    this.load(data, options);
  }
  this.clone = function() {
    var newObj = new JSZip();
    for (var i in this) {
      if (typeof this[i] !== "function") {
        newObj[i] = this[i];
      }
    }
    return newObj;
  };
}
JSZip.prototype = require('./object');
JSZip.prototype.load = require('./load');
JSZip.support = require('./support');
JSZip.defaults = require('./defaults');
JSZip.utils = require('./deprecatedPublicUtils');
JSZip.base64 = {
  encode: function(input) {
    return base64.encode(input);
  },
  decode: function(input) {
    return base64.decode(input);
  }
};
JSZip.compressions = require('./compressions');
module.exports = JSZip;
