/* */ 
var util = require('util');
var DEFAULTS = {
  '*': {
    colors: {opacity: true},
    properties: {
      backgroundClipMerging: false,
      backgroundOriginMerging: false,
      backgroundSizeMerging: false,
      colors: true,
      ieBangHack: false,
      iePrefixHack: false,
      ieSuffixHack: true,
      merging: true,
      shorterLengthUnits: false,
      spaceAfterClosingBrace: true,
      urlQuotes: false,
      zeroUnits: true
    },
    selectors: {
      adjacentSpace: false,
      ie7Hack: false,
      special: /(\-moz\-|\-ms\-|\-o\-|\-webkit\-|:dir\([a-z-]*\)|:first(?![a-z-])|:fullscreen|:left|:read-only|:read-write|:right|:placeholder|:host|::content|\/deep\/|::shadow)/
    },
    units: {
      ch: true,
      in: true,
      pc: true,
      pt: true,
      rem: true,
      vh: true,
      vm: true,
      vmax: true,
      vmin: true,
      vw: true
    }
  },
  'ie8': {
    colors: {opacity: false},
    properties: {
      backgroundClipMerging: false,
      backgroundOriginMerging: false,
      backgroundSizeMerging: false,
      colors: true,
      ieBangHack: false,
      iePrefixHack: true,
      ieSuffixHack: true,
      merging: false,
      shorterLengthUnits: false,
      spaceAfterClosingBrace: true,
      urlQuotes: false,
      zeroUnits: true
    },
    selectors: {
      adjacentSpace: false,
      ie7Hack: false,
      special: /(\-moz\-|\-ms\-|\-o\-|\-webkit\-|:root|:nth|:first\-of|:last|:only|:empty|:target|:checked|::selection|:enabled|:disabled|:not|:placeholder|:host|::content|\/deep\/|::shadow)/
    },
    units: {
      ch: false,
      in: true,
      pc: true,
      pt: true,
      rem: false,
      vh: false,
      vm: false,
      vmax: false,
      vmin: false,
      vw: false
    }
  },
  'ie7': {
    colors: {opacity: false},
    properties: {
      backgroundClipMerging: false,
      backgroundOriginMerging: false,
      backgroundSizeMerging: false,
      colors: true,
      ieBangHack: true,
      iePrefixHack: true,
      ieSuffixHack: true,
      merging: false,
      shorterLengthUnits: false,
      spaceAfterClosingBrace: true,
      urlQuotes: false,
      zeroUnits: true
    },
    selectors: {
      adjacentSpace: false,
      ie7Hack: true,
      special: /(\-moz\-|\-ms\-|\-o\-|\-webkit\-|:focus|:before|:after|:root|:nth|:first\-of|:last|:only|:empty|:target|:checked|::selection|:enabled|:disabled|:not|:placeholder|:host|::content|\/deep\/|::shadow)/
    },
    units: {
      ch: false,
      in: true,
      pc: true,
      pt: true,
      rem: false,
      vh: false,
      vm: false,
      vmax: false,
      vmin: false,
      vw: false
    }
  }
};
function Compatibility(source) {
  this.source = source || {};
}
function merge(source, target) {
  for (var key in source) {
    var value = source[key];
    if (typeof value === 'object' && !util.isRegExp(value))
      target[key] = merge(value, target[key] || {});
    else
      target[key] = key in target ? target[key] : value;
  }
  return target;
}
function calculateSource(source) {
  if (typeof source == 'object')
    return source;
  if (!/[,\+\-]/.test(source))
    return DEFAULTS[source] || DEFAULTS['*'];
  var parts = source.split(',');
  var template = parts[0] in DEFAULTS ? DEFAULTS[parts.shift()] : DEFAULTS['*'];
  source = {};
  parts.forEach(function(part) {
    var isAdd = part[0] == '+';
    var key = part.substring(1).split('.');
    var group = key[0];
    var option = key[1];
    source[group] = source[group] || {};
    source[group][option] = isAdd;
  });
  return merge(template, source);
}
Compatibility.prototype.toOptions = function() {
  return merge(DEFAULTS['*'], calculateSource(this.source));
};
module.exports = Compatibility;
