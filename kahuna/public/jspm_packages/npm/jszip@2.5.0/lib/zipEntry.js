/* */ 
(function(process) {
  'use strict';
  var StringReader = require('./stringReader');
  var utils = require('./utils');
  var CompressedObject = require('./compressedObject');
  var jszipProto = require('./object');
  var MADE_BY_DOS = 0x00;
  var MADE_BY_UNIX = 0x03;
  function ZipEntry(options, loadOptions) {
    this.options = options;
    this.loadOptions = loadOptions;
  }
  ZipEntry.prototype = {
    isEncrypted: function() {
      return (this.bitFlag & 0x0001) === 0x0001;
    },
    useUTF8: function() {
      return (this.bitFlag & 0x0800) === 0x0800;
    },
    prepareCompressedContent: function(reader, from, length) {
      return function() {
        var previousIndex = reader.index;
        reader.setIndex(from);
        var compressedFileData = reader.readData(length);
        reader.setIndex(previousIndex);
        return compressedFileData;
      };
    },
    prepareContent: function(reader, from, length, compression, uncompressedSize) {
      return function() {
        var compressedFileData = utils.transformTo(compression.uncompressInputType, this.getCompressedContent());
        var uncompressedFileData = compression.uncompress(compressedFileData);
        if (uncompressedFileData.length !== uncompressedSize) {
          throw new Error("Bug : uncompressed data size mismatch");
        }
        return uncompressedFileData;
      };
    },
    readLocalPart: function(reader) {
      var compression,
          localExtraFieldsLength;
      reader.skip(22);
      this.fileNameLength = reader.readInt(2);
      localExtraFieldsLength = reader.readInt(2);
      this.fileName = reader.readString(this.fileNameLength);
      reader.skip(localExtraFieldsLength);
      if (this.compressedSize == -1 || this.uncompressedSize == -1) {
        throw new Error("Bug or corrupted zip : didn't get enough informations from the central directory " + "(compressedSize == -1 || uncompressedSize == -1)");
      }
      compression = utils.findCompression(this.compressionMethod);
      if (compression === null) {
        throw new Error("Corrupted zip : compression " + utils.pretty(this.compressionMethod) + " unknown (inner file : " + this.fileName + ")");
      }
      this.decompressed = new CompressedObject();
      this.decompressed.compressedSize = this.compressedSize;
      this.decompressed.uncompressedSize = this.uncompressedSize;
      this.decompressed.crc32 = this.crc32;
      this.decompressed.compressionMethod = this.compressionMethod;
      this.decompressed.getCompressedContent = this.prepareCompressedContent(reader, reader.index, this.compressedSize, compression);
      this.decompressed.getContent = this.prepareContent(reader, reader.index, this.compressedSize, compression, this.uncompressedSize);
      if (this.loadOptions.checkCRC32) {
        this.decompressed = utils.transformTo("string", this.decompressed.getContent());
        if (jszipProto.crc32(this.decompressed) !== this.crc32) {
          throw new Error("Corrupted zip : CRC32 mismatch");
        }
      }
    },
    readCentralPart: function(reader) {
      this.versionMadeBy = reader.readInt(2);
      this.versionNeeded = reader.readInt(2);
      this.bitFlag = reader.readInt(2);
      this.compressionMethod = reader.readString(2);
      this.date = reader.readDate();
      this.crc32 = reader.readInt(4);
      this.compressedSize = reader.readInt(4);
      this.uncompressedSize = reader.readInt(4);
      this.fileNameLength = reader.readInt(2);
      this.extraFieldsLength = reader.readInt(2);
      this.fileCommentLength = reader.readInt(2);
      this.diskNumberStart = reader.readInt(2);
      this.internalFileAttributes = reader.readInt(2);
      this.externalFileAttributes = reader.readInt(4);
      this.localHeaderOffset = reader.readInt(4);
      if (this.isEncrypted()) {
        throw new Error("Encrypted zip are not supported");
      }
      this.fileName = reader.readString(this.fileNameLength);
      this.readExtraFields(reader);
      this.parseZIP64ExtraField(reader);
      this.fileComment = reader.readString(this.fileCommentLength);
    },
    processAttributes: function() {
      this.unixPermissions = null;
      this.dosPermissions = null;
      var madeBy = this.versionMadeBy >> 8;
      this.dir = this.externalFileAttributes & 0x0010 ? true : false;
      if (madeBy === MADE_BY_DOS) {
        this.dosPermissions = this.externalFileAttributes & 0x3F;
      }
      if (madeBy === MADE_BY_UNIX) {
        this.unixPermissions = (this.externalFileAttributes >> 16) & 0xFFFF;
      }
      if (!this.dir && this.fileName.slice(-1) === '/') {
        this.dir = true;
      }
    },
    parseZIP64ExtraField: function(reader) {
      if (!this.extraFields[0x0001]) {
        return;
      }
      var extraReader = new StringReader(this.extraFields[0x0001].value);
      if (this.uncompressedSize === utils.MAX_VALUE_32BITS) {
        this.uncompressedSize = extraReader.readInt(8);
      }
      if (this.compressedSize === utils.MAX_VALUE_32BITS) {
        this.compressedSize = extraReader.readInt(8);
      }
      if (this.localHeaderOffset === utils.MAX_VALUE_32BITS) {
        this.localHeaderOffset = extraReader.readInt(8);
      }
      if (this.diskNumberStart === utils.MAX_VALUE_32BITS) {
        this.diskNumberStart = extraReader.readInt(4);
      }
    },
    readExtraFields: function(reader) {
      var start = reader.index,
          extraFieldId,
          extraFieldLength,
          extraFieldValue;
      this.extraFields = this.extraFields || {};
      while (reader.index < start + this.extraFieldsLength) {
        extraFieldId = reader.readInt(2);
        extraFieldLength = reader.readInt(2);
        extraFieldValue = reader.readString(extraFieldLength);
        this.extraFields[extraFieldId] = {
          id: extraFieldId,
          length: extraFieldLength,
          value: extraFieldValue
        };
      }
    },
    handleUTF8: function() {
      if (this.useUTF8()) {
        this.fileName = jszipProto.utf8decode(this.fileName);
        this.fileComment = jszipProto.utf8decode(this.fileComment);
      } else {
        var upath = this.findExtraFieldUnicodePath();
        if (upath !== null) {
          this.fileName = upath;
        }
        var ucomment = this.findExtraFieldUnicodeComment();
        if (ucomment !== null) {
          this.fileComment = ucomment;
        }
      }
    },
    findExtraFieldUnicodePath: function() {
      var upathField = this.extraFields[0x7075];
      if (upathField) {
        var extraReader = new StringReader(upathField.value);
        if (extraReader.readInt(1) !== 1) {
          return null;
        }
        if (jszipProto.crc32(this.fileName) !== extraReader.readInt(4)) {
          return null;
        }
        return jszipProto.utf8decode(extraReader.readString(upathField.length - 5));
      }
      return null;
    },
    findExtraFieldUnicodeComment: function() {
      var ucommentField = this.extraFields[0x6375];
      if (ucommentField) {
        var extraReader = new StringReader(ucommentField.value);
        if (extraReader.readInt(1) !== 1) {
          return null;
        }
        if (jszipProto.crc32(this.fileComment) !== extraReader.readInt(4)) {
          return null;
        }
        return jszipProto.utf8decode(extraReader.readString(ucommentField.length - 5));
      }
      return null;
    }
  };
  module.exports = ZipEntry;
})(require('process'));
