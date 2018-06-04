/* */ 
(function(Buffer, process) {
  'use strict';
  var support = require('./support');
  var utils = require('./utils');
  var crc32 = require('./crc32');
  var signature = require('./signature');
  var defaults = require('./defaults');
  var base64 = require('./base64');
  var compressions = require('./compressions');
  var CompressedObject = require('./compressedObject');
  var nodeBuffer = require('./nodeBuffer');
  var utf8 = require('./utf8');
  var StringWriter = require('./stringWriter');
  var Uint8ArrayWriter = require('./uint8ArrayWriter');
  var getRawData = function(file) {
    if (file._data instanceof CompressedObject) {
      file._data = file._data.getContent();
      file.options.binary = true;
      file.options.base64 = false;
      if (utils.getTypeOf(file._data) === "uint8array") {
        var copy = file._data;
        file._data = new Uint8Array(copy.length);
        if (copy.length !== 0) {
          file._data.set(copy, 0);
        }
      }
    }
    return file._data;
  };
  var getBinaryData = function(file) {
    var result = getRawData(file),
        type = utils.getTypeOf(result);
    if (type === "string") {
      if (!file.options.binary) {
        if (support.nodebuffer) {
          return nodeBuffer(result, "utf-8");
        }
      }
      return file.asBinary();
    }
    return result;
  };
  var dataToString = function(asUTF8) {
    var result = getRawData(this);
    if (result === null || typeof result === "undefined") {
      return "";
    }
    if (this.options.base64) {
      result = base64.decode(result);
    }
    if (asUTF8 && this.options.binary) {
      result = out.utf8decode(result);
    } else {
      result = utils.transformTo("string", result);
    }
    if (!asUTF8 && !this.options.binary) {
      result = utils.transformTo("string", out.utf8encode(result));
    }
    return result;
  };
  var ZipObject = function(name, data, options) {
    this.name = name;
    this.dir = options.dir;
    this.date = options.date;
    this.comment = options.comment;
    this.unixPermissions = options.unixPermissions;
    this.dosPermissions = options.dosPermissions;
    this._data = data;
    this.options = options;
    this._initialMetadata = {
      dir: options.dir,
      date: options.date
    };
  };
  ZipObject.prototype = {
    asText: function() {
      return dataToString.call(this, true);
    },
    asBinary: function() {
      return dataToString.call(this, false);
    },
    asNodeBuffer: function() {
      var result = getBinaryData(this);
      return utils.transformTo("nodebuffer", result);
    },
    asUint8Array: function() {
      var result = getBinaryData(this);
      return utils.transformTo("uint8array", result);
    },
    asArrayBuffer: function() {
      return this.asUint8Array().buffer;
    }
  };
  var decToHex = function(dec, bytes) {
    var hex = "",
        i;
    for (i = 0; i < bytes; i++) {
      hex += String.fromCharCode(dec & 0xff);
      dec = dec >>> 8;
    }
    return hex;
  };
  var extend = function() {
    var result = {},
        i,
        attr;
    for (i = 0; i < arguments.length; i++) {
      for (attr in arguments[i]) {
        if (arguments[i].hasOwnProperty(attr) && typeof result[attr] === "undefined") {
          result[attr] = arguments[i][attr];
        }
      }
    }
    return result;
  };
  var prepareFileAttrs = function(o) {
    o = o || {};
    if (o.base64 === true && (o.binary === null || o.binary === undefined)) {
      o.binary = true;
    }
    o = extend(o, defaults);
    o.date = o.date || new Date();
    if (o.compression !== null)
      o.compression = o.compression.toUpperCase();
    return o;
  };
  var fileAdd = function(name, data, o) {
    var dataType = utils.getTypeOf(data),
        parent;
    o = prepareFileAttrs(o);
    if (typeof o.unixPermissions === "string") {
      o.unixPermissions = parseInt(o.unixPermissions, 8);
    }
    if (o.unixPermissions && (o.unixPermissions & 0x4000)) {
      o.dir = true;
    }
    if (o.dosPermissions && (o.dosPermissions & 0x0010)) {
      o.dir = true;
    }
    if (o.dir) {
      name = forceTrailingSlash(name);
    }
    if (o.createFolders && (parent = parentFolder(name))) {
      folderAdd.call(this, parent, true);
    }
    if (o.dir || data === null || typeof data === "undefined") {
      o.base64 = false;
      o.binary = false;
      data = null;
      dataType = null;
    } else if (dataType === "string") {
      if (o.binary && !o.base64) {
        if (o.optimizedBinaryString !== true) {
          data = utils.string2binary(data);
        }
      }
    } else {
      o.base64 = false;
      o.binary = true;
      if (!dataType && !(data instanceof CompressedObject)) {
        throw new Error("The data of '" + name + "' is in an unsupported format !");
      }
      if (dataType === "arraybuffer") {
        data = utils.transformTo("uint8array", data);
      }
    }
    var object = new ZipObject(name, data, o);
    this.files[name] = object;
    return object;
  };
  var parentFolder = function(path) {
    if (path.slice(-1) == '/') {
      path = path.substring(0, path.length - 1);
    }
    var lastSlash = path.lastIndexOf('/');
    return (lastSlash > 0) ? path.substring(0, lastSlash) : "";
  };
  var forceTrailingSlash = function(path) {
    if (path.slice(-1) != "/") {
      path += "/";
    }
    return path;
  };
  var folderAdd = function(name, createFolders) {
    createFolders = (typeof createFolders !== 'undefined') ? createFolders : false;
    name = forceTrailingSlash(name);
    if (!this.files[name]) {
      fileAdd.call(this, name, null, {
        dir: true,
        createFolders: createFolders
      });
    }
    return this.files[name];
  };
  var generateCompressedObjectFrom = function(file, compression, compressionOptions) {
    var result = new CompressedObject(),
        content;
    if (file._data instanceof CompressedObject) {
      result.uncompressedSize = file._data.uncompressedSize;
      result.crc32 = file._data.crc32;
      if (result.uncompressedSize === 0 || file.dir) {
        compression = compressions['STORE'];
        result.compressedContent = "";
        result.crc32 = 0;
      } else if (file._data.compressionMethod === compression.magic) {
        result.compressedContent = file._data.getCompressedContent();
      } else {
        content = file._data.getContent();
        result.compressedContent = compression.compress(utils.transformTo(compression.compressInputType, content), compressionOptions);
      }
    } else {
      content = getBinaryData(file);
      if (!content || content.length === 0 || file.dir) {
        compression = compressions['STORE'];
        content = "";
      }
      result.uncompressedSize = content.length;
      result.crc32 = crc32(content);
      result.compressedContent = compression.compress(utils.transformTo(compression.compressInputType, content), compressionOptions);
    }
    result.compressedSize = result.compressedContent.length;
    result.compressionMethod = compression.magic;
    return result;
  };
  var generateUnixExternalFileAttr = function(unixPermissions, isDir) {
    var result = unixPermissions;
    if (!unixPermissions) {
      result = isDir ? 0x41fd : 0x81b4;
    }
    return (result & 0xFFFF) << 16;
  };
  var generateDosExternalFileAttr = function(dosPermissions, isDir) {
    return (dosPermissions || 0) & 0x3F;
  };
  var generateZipParts = function(name, file, compressedObject, offset, platform) {
    var data = compressedObject.compressedContent,
        utfEncodedFileName = utils.transformTo("string", utf8.utf8encode(file.name)),
        comment = file.comment || "",
        utfEncodedComment = utils.transformTo("string", utf8.utf8encode(comment)),
        useUTF8ForFileName = utfEncodedFileName.length !== file.name.length,
        useUTF8ForComment = utfEncodedComment.length !== comment.length,
        o = file.options,
        dosTime,
        dosDate,
        extraFields = "",
        unicodePathExtraField = "",
        unicodeCommentExtraField = "",
        dir,
        date;
    if (file._initialMetadata.dir !== file.dir) {
      dir = file.dir;
    } else {
      dir = o.dir;
    }
    if (file._initialMetadata.date !== file.date) {
      date = file.date;
    } else {
      date = o.date;
    }
    var extFileAttr = 0;
    var versionMadeBy = 0;
    if (dir) {
      extFileAttr |= 0x00010;
    }
    if (platform === "UNIX") {
      versionMadeBy = 0x031E;
      extFileAttr |= generateUnixExternalFileAttr(file.unixPermissions, dir);
    } else {
      versionMadeBy = 0x0014;
      extFileAttr |= generateDosExternalFileAttr(file.dosPermissions, dir);
    }
    dosTime = date.getHours();
    dosTime = dosTime << 6;
    dosTime = dosTime | date.getMinutes();
    dosTime = dosTime << 5;
    dosTime = dosTime | date.getSeconds() / 2;
    dosDate = date.getFullYear() - 1980;
    dosDate = dosDate << 4;
    dosDate = dosDate | (date.getMonth() + 1);
    dosDate = dosDate << 5;
    dosDate = dosDate | date.getDate();
    if (useUTF8ForFileName) {
      unicodePathExtraField = decToHex(1, 1) + decToHex(crc32(utfEncodedFileName), 4) + utfEncodedFileName;
      extraFields += "\x75\x70" + decToHex(unicodePathExtraField.length, 2) + unicodePathExtraField;
    }
    if (useUTF8ForComment) {
      unicodeCommentExtraField = decToHex(1, 1) + decToHex(this.crc32(utfEncodedComment), 4) + utfEncodedComment;
      extraFields += "\x75\x63" + decToHex(unicodeCommentExtraField.length, 2) + unicodeCommentExtraField;
    }
    var header = "";
    header += "\x0A\x00";
    header += (useUTF8ForFileName || useUTF8ForComment) ? "\x00\x08" : "\x00\x00";
    header += compressedObject.compressionMethod;
    header += decToHex(dosTime, 2);
    header += decToHex(dosDate, 2);
    header += decToHex(compressedObject.crc32, 4);
    header += decToHex(compressedObject.compressedSize, 4);
    header += decToHex(compressedObject.uncompressedSize, 4);
    header += decToHex(utfEncodedFileName.length, 2);
    header += decToHex(extraFields.length, 2);
    var fileRecord = signature.LOCAL_FILE_HEADER + header + utfEncodedFileName + extraFields;
    var dirRecord = signature.CENTRAL_FILE_HEADER + decToHex(versionMadeBy, 2) + header + decToHex(utfEncodedComment.length, 2) + "\x00\x00" + "\x00\x00" + decToHex(extFileAttr, 4) + decToHex(offset, 4) + utfEncodedFileName + extraFields + utfEncodedComment;
    return {
      fileRecord: fileRecord,
      dirRecord: dirRecord,
      compressedObject: compressedObject
    };
  };
  var out = {
    load: function(stream, options) {
      throw new Error("Load method is not defined. Is the file jszip-load.js included ?");
    },
    filter: function(search) {
      var result = [],
          filename,
          relativePath,
          file,
          fileClone;
      for (filename in this.files) {
        if (!this.files.hasOwnProperty(filename)) {
          continue;
        }
        file = this.files[filename];
        fileClone = new ZipObject(file.name, file._data, extend(file.options));
        relativePath = filename.slice(this.root.length, filename.length);
        if (filename.slice(0, this.root.length) === this.root && search(relativePath, fileClone)) {
          result.push(fileClone);
        }
      }
      return result;
    },
    file: function(name, data, o) {
      if (arguments.length === 1) {
        if (utils.isRegExp(name)) {
          var regexp = name;
          return this.filter(function(relativePath, file) {
            return !file.dir && regexp.test(relativePath);
          });
        } else {
          return this.filter(function(relativePath, file) {
            return !file.dir && relativePath === name;
          })[0] || null;
        }
      } else {
        name = this.root + name;
        fileAdd.call(this, name, data, o);
      }
      return this;
    },
    folder: function(arg) {
      if (!arg) {
        return this;
      }
      if (utils.isRegExp(arg)) {
        return this.filter(function(relativePath, file) {
          return file.dir && arg.test(relativePath);
        });
      }
      var name = this.root + arg;
      var newFolder = folderAdd.call(this, name);
      var ret = this.clone();
      ret.root = newFolder.name;
      return ret;
    },
    remove: function(name) {
      name = this.root + name;
      var file = this.files[name];
      if (!file) {
        if (name.slice(-1) != "/") {
          name += "/";
        }
        file = this.files[name];
      }
      if (file && !file.dir) {
        delete this.files[name];
      } else {
        var kids = this.filter(function(relativePath, file) {
          return file.name.slice(0, name.length) === name;
        });
        for (var i = 0; i < kids.length; i++) {
          delete this.files[kids[i].name];
        }
      }
      return this;
    },
    generate: function(options) {
      options = extend(options || {}, {
        base64: true,
        compression: "STORE",
        compressionOptions: null,
        type: "base64",
        platform: "DOS",
        comment: null,
        mimeType: 'application/zip'
      });
      utils.checkSupport(options.type);
      if (options.platform === 'darwin' || options.platform === 'freebsd' || options.platform === 'linux' || options.platform === 'sunos') {
        options.platform = "UNIX";
      }
      if (options.platform === 'win32') {
        options.platform = "DOS";
      }
      var zipData = [],
          localDirLength = 0,
          centralDirLength = 0,
          writer,
          i,
          utfEncodedComment = utils.transformTo("string", this.utf8encode(options.comment || this.comment || ""));
      for (var name in this.files) {
        if (!this.files.hasOwnProperty(name)) {
          continue;
        }
        var file = this.files[name];
        var compressionName = file.options.compression || options.compression.toUpperCase();
        var compression = compressions[compressionName];
        if (!compression) {
          throw new Error(compressionName + " is not a valid compression method !");
        }
        var compressionOptions = file.options.compressionOptions || options.compressionOptions || {};
        var compressedObject = generateCompressedObjectFrom.call(this, file, compression, compressionOptions);
        var zipPart = generateZipParts.call(this, name, file, compressedObject, localDirLength, options.platform);
        localDirLength += zipPart.fileRecord.length + compressedObject.compressedSize;
        centralDirLength += zipPart.dirRecord.length;
        zipData.push(zipPart);
      }
      var dirEnd = "";
      dirEnd = signature.CENTRAL_DIRECTORY_END + "\x00\x00" + "\x00\x00" + decToHex(zipData.length, 2) + decToHex(zipData.length, 2) + decToHex(centralDirLength, 4) + decToHex(localDirLength, 4) + decToHex(utfEncodedComment.length, 2) + utfEncodedComment;
      var typeName = options.type.toLowerCase();
      if (typeName === "uint8array" || typeName === "arraybuffer" || typeName === "blob" || typeName === "nodebuffer") {
        writer = new Uint8ArrayWriter(localDirLength + centralDirLength + dirEnd.length);
      } else {
        writer = new StringWriter(localDirLength + centralDirLength + dirEnd.length);
      }
      for (i = 0; i < zipData.length; i++) {
        writer.append(zipData[i].fileRecord);
        writer.append(zipData[i].compressedObject.compressedContent);
      }
      for (i = 0; i < zipData.length; i++) {
        writer.append(zipData[i].dirRecord);
      }
      writer.append(dirEnd);
      var zip = writer.finalize();
      switch (options.type.toLowerCase()) {
        case "uint8array":
        case "arraybuffer":
        case "nodebuffer":
          return utils.transformTo(options.type.toLowerCase(), zip);
        case "blob":
          return utils.arrayBuffer2Blob(utils.transformTo("arraybuffer", zip), options.mimeType);
        case "base64":
          return (options.base64) ? base64.encode(zip) : zip;
        default:
          return zip;
      }
    },
    crc32: function(input, crc) {
      return crc32(input, crc);
    },
    utf8encode: function(string) {
      return utils.transformTo("string", utf8.utf8encode(string));
    },
    utf8decode: function(input) {
      return utf8.utf8decode(input);
    }
  };
  module.exports = out;
})(require('buffer').Buffer, require('process'));
