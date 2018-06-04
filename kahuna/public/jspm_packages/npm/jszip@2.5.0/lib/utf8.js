/* */ 
(function(Buffer, process) {
  'use strict';
  var utils = require('./utils');
  var support = require('./support');
  var nodeBuffer = require('./nodeBuffer');
  var _utf8len = new Array(256);
  for (var i = 0; i < 256; i++) {
    _utf8len[i] = (i >= 252 ? 6 : i >= 248 ? 5 : i >= 240 ? 4 : i >= 224 ? 3 : i >= 192 ? 2 : 1);
  }
  _utf8len[254] = _utf8len[254] = 1;
  var string2buf = function(str) {
    var buf,
        c,
        c2,
        m_pos,
        i,
        str_len = str.length,
        buf_len = 0;
    for (m_pos = 0; m_pos < str_len; m_pos++) {
      c = str.charCodeAt(m_pos);
      if ((c & 0xfc00) === 0xd800 && (m_pos + 1 < str_len)) {
        c2 = str.charCodeAt(m_pos + 1);
        if ((c2 & 0xfc00) === 0xdc00) {
          c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
          m_pos++;
        }
      }
      buf_len += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    }
    if (support.uint8array) {
      buf = new Uint8Array(buf_len);
    } else {
      buf = new Array(buf_len);
    }
    for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
      c = str.charCodeAt(m_pos);
      if ((c & 0xfc00) === 0xd800 && (m_pos + 1 < str_len)) {
        c2 = str.charCodeAt(m_pos + 1);
        if ((c2 & 0xfc00) === 0xdc00) {
          c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
          m_pos++;
        }
      }
      if (c < 0x80) {
        buf[i++] = c;
      } else if (c < 0x800) {
        buf[i++] = 0xC0 | (c >>> 6);
        buf[i++] = 0x80 | (c & 0x3f);
      } else if (c < 0x10000) {
        buf[i++] = 0xE0 | (c >>> 12);
        buf[i++] = 0x80 | (c >>> 6 & 0x3f);
        buf[i++] = 0x80 | (c & 0x3f);
      } else {
        buf[i++] = 0xf0 | (c >>> 18);
        buf[i++] = 0x80 | (c >>> 12 & 0x3f);
        buf[i++] = 0x80 | (c >>> 6 & 0x3f);
        buf[i++] = 0x80 | (c & 0x3f);
      }
    }
    return buf;
  };
  var utf8border = function(buf, max) {
    var pos;
    max = max || buf.length;
    if (max > buf.length) {
      max = buf.length;
    }
    pos = max - 1;
    while (pos >= 0 && (buf[pos] & 0xC0) === 0x80) {
      pos--;
    }
    if (pos < 0) {
      return max;
    }
    if (pos === 0) {
      return max;
    }
    return (pos + _utf8len[buf[pos]] > max) ? pos : max;
  };
  var buf2string = function(buf) {
    var str,
        i,
        out,
        c,
        c_len;
    var len = buf.length;
    var utf16buf = new Array(len * 2);
    for (out = 0, i = 0; i < len; ) {
      c = buf[i++];
      if (c < 0x80) {
        utf16buf[out++] = c;
        continue;
      }
      c_len = _utf8len[c];
      if (c_len > 4) {
        utf16buf[out++] = 0xfffd;
        i += c_len - 1;
        continue;
      }
      c &= c_len === 2 ? 0x1f : c_len === 3 ? 0x0f : 0x07;
      while (c_len > 1 && i < len) {
        c = (c << 6) | (buf[i++] & 0x3f);
        c_len--;
      }
      if (c_len > 1) {
        utf16buf[out++] = 0xfffd;
        continue;
      }
      if (c < 0x10000) {
        utf16buf[out++] = c;
      } else {
        c -= 0x10000;
        utf16buf[out++] = 0xd800 | ((c >> 10) & 0x3ff);
        utf16buf[out++] = 0xdc00 | (c & 0x3ff);
      }
    }
    if (utf16buf.length !== out) {
      if (utf16buf.subarray) {
        utf16buf = utf16buf.subarray(0, out);
      } else {
        utf16buf.length = out;
      }
    }
    return utils.applyFromCharCode(utf16buf);
  };
  exports.utf8encode = function utf8encode(str) {
    if (support.nodebuffer) {
      return nodeBuffer(str, "utf-8");
    }
    return string2buf(str);
  };
  exports.utf8decode = function utf8decode(buf) {
    if (support.nodebuffer) {
      return utils.transformTo("nodebuffer", buf).toString("utf-8");
    }
    buf = utils.transformTo(support.uint8array ? "uint8array" : "array", buf);
    var result = [],
        k = 0,
        len = buf.length,
        chunk = 65536;
    while (k < len) {
      var nextBoundary = utf8border(buf, Math.min(k + chunk, len));
      if (support.uint8array) {
        result.push(buf2string(buf.subarray(k, nextBoundary)));
      } else {
        result.push(buf2string(buf.slice(k, nextBoundary)));
      }
      k = nextBoundary;
    }
    return result.join("");
  };
})(require('buffer').Buffer, require('process'));
