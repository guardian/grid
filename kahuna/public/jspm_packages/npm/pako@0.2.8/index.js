/* */ 
'use strict';
var assign = require('./lib/utils/common').assign;
var deflate = require('./lib/deflate');
var inflate = require('./lib/inflate');
var constants = require('./lib/zlib/constants');
var pako = {};
assign(pako, deflate, inflate, constants);
module.exports = pako;
