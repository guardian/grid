/* */ 
(function(Buffer) {
  'use strict';
  var support = require('./support');
  var compressions = require('./compressions');
  var nodeBuffer = require('./nodeBuffer');
  exports.string2binary = function(str) {
    var result = "";
    for (var i = 0; i < str.length; i++) {
      result += String.fromCharCode(str.charCodeAt(i) & 0xff);
    }
    return result;
  };
  exports.arrayBuffer2Blob = function(buffer, mimeType) {
    exports.checkSupport("blob");
    mimeType = mimeType || 'application/zip';
    try {
      return new Blob([buffer], {type: mimeType});
    } catch (e) {
      try {
        var Builder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder || window.MSBlobBuilder;
        var builder = new Builder();
        builder.append(buffer);
        return builder.getBlob(mimeType);
      } catch (e) {
        throw new Error("Bug : can't construct the Blob.");
      }
    }
  };
  function identity(input) {
    return input;
  }
  function stringToArrayLike(str, array) {
    for (var i = 0; i < str.length; ++i) {
      array[i] = str.charCodeAt(i) & 0xFF;
    }
    return array;
  }
  function arrayLikeToString(array) {
    var chunk = 65536;
    var result = [],
        len = array.length,
        type = exports.getTypeOf(array),
        k = 0,
        canUseApply = true;
    try {
      switch (type) {
        case "uint8array":
          String.fromCharCode.apply(null, new Uint8Array(0));
          break;
        case "nodebuffer":
          String.fromCharCode.apply(null, nodeBuffer(0));
          break;
      }
    } catch (e) {
      canUseApply = false;
    }
    if (!canUseApply) {
      var resultStr = "";
      for (var i = 0; i < array.length; i++) {
        resultStr += String.fromCharCode(array[i]);
      }
      return resultStr;
    }
    while (k < len && chunk > 1) {
      try {
        if (type === "array" || type === "nodebuffer") {
          result.push(String.fromCharCode.apply(null, array.slice(k, Math.min(k + chunk, len))));
        } else {
          result.push(String.fromCharCode.apply(null, array.subarray(k, Math.min(k + chunk, len))));
        }
        k += chunk;
      } catch (e) {
        chunk = Math.floor(chunk / 2);
      }
    }
    return result.join("");
  }
  exports.applyFromCharCode = arrayLikeToString;
  function arrayLikeToArrayLike(arrayFrom, arrayTo) {
    for (var i = 0; i < arrayFrom.length; i++) {
      arrayTo[i] = arrayFrom[i];
    }
    return arrayTo;
  }
  var transform = {};
  transform["string"] = {
    "string": identity,
    "array": function(input) {
      return stringToArrayLike(input, new Array(input.length));
    },
    "arraybuffer": function(input) {
      return transform["string"]["uint8array"](input).buffer;
    },
    "uint8array": function(input) {
      return stringToArrayLike(input, new Uint8Array(input.length));
    },
    "nodebuffer": function(input) {
      return stringToArrayLike(input, nodeBuffer(input.length));
    }
  };
  transform["array"] = {
    "string": arrayLikeToString,
    "array": identity,
    "arraybuffer": function(input) {
      return (new Uint8Array(input)).buffer;
    },
    "uint8array": function(input) {
      return new Uint8Array(input);
    },
    "nodebuffer": function(input) {
      return nodeBuffer(input);
    }
  };
  transform["arraybuffer"] = {
    "string": function(input) {
      return arrayLikeToString(new Uint8Array(input));
    },
    "array": function(input) {
      return arrayLikeToArrayLike(new Uint8Array(input), new Array(input.byteLength));
    },
    "arraybuffer": identity,
    "uint8array": function(input) {
      return new Uint8Array(input);
    },
    "nodebuffer": function(input) {
      return nodeBuffer(new Uint8Array(input));
    }
  };
  transform["uint8array"] = {
    "string": arrayLikeToString,
    "array": function(input) {
      return arrayLikeToArrayLike(input, new Array(input.length));
    },
    "arraybuffer": function(input) {
      return input.buffer;
    },
    "uint8array": identity,
    "nodebuffer": function(input) {
      return nodeBuffer(input);
    }
  };
  transform["nodebuffer"] = {
    "string": arrayLikeToString,
    "array": function(input) {
      return arrayLikeToArrayLike(input, new Array(input.length));
    },
    "arraybuffer": function(input) {
      return transform["nodebuffer"]["uint8array"](input).buffer;
    },
    "uint8array": function(input) {
      return arrayLikeToArrayLike(input, new Uint8Array(input.length));
    },
    "nodebuffer": identity
  };
  exports.transformTo = function(outputType, input) {
    if (!input) {
      input = "";
    }
    if (!outputType) {
      return input;
    }
    exports.checkSupport(outputType);
    var inputType = exports.getTypeOf(input);
    var result = transform[inputType][outputType](input);
    return result;
  };
  exports.getTypeOf = function(input) {
    if (typeof input === "string") {
      return "string";
    }
    if (Object.prototype.toString.call(input) === "[object Array]") {
      return "array";
    }
    if (support.nodebuffer && nodeBuffer.test(input)) {
      return "nodebuffer";
    }
    if (support.uint8array && input instanceof Uint8Array) {
      return "uint8array";
    }
    if (support.arraybuffer && input instanceof ArrayBuffer) {
      return "arraybuffer";
    }
  };
  exports.checkSupport = function(type) {
    var supported = support[type.toLowerCase()];
    if (!supported) {
      throw new Error(type + " is not supported by this browser");
    }
  };
  exports.MAX_VALUE_16BITS = 65535;
  exports.MAX_VALUE_32BITS = -1;
  exports.pretty = function(str) {
    var res = '',
        code,
        i;
    for (i = 0; i < (str || "").length; i++) {
      code = str.charCodeAt(i);
      res += '\\x' + (code < 16 ? "0" : "") + code.toString(16).toUpperCase();
    }
    return res;
  };
  exports.findCompression = function(compressionMethod) {
    for (var method in compressions) {
      if (!compressions.hasOwnProperty(method)) {
        continue;
      }
      if (compressions[method].magic === compressionMethod) {
        return compressions[method];
      }
    }
    return null;
  };
  exports.isRegExp = function(object) {
    return Object.prototype.toString.call(object) === "[object RegExp]";
  };
})(require('buffer').Buffer);
