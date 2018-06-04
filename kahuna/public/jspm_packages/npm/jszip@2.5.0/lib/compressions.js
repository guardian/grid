/* */ 
'use strict';
exports.STORE = {
  magic: "\x00\x00",
  compress: function(content, compressionOptions) {
    return content;
  },
  uncompress: function(content) {
    return content;
  },
  compressInputType: null,
  uncompressInputType: null
};
exports.DEFLATE = require('./flate');
