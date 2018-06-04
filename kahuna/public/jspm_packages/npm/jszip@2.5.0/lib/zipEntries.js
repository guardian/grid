/* */ 
(function(Buffer) {
  'use strict';
  var StringReader = require('./stringReader');
  var NodeBufferReader = require('./nodeBufferReader');
  var Uint8ArrayReader = require('./uint8ArrayReader');
  var utils = require('./utils');
  var sig = require('./signature');
  var ZipEntry = require('./zipEntry');
  var support = require('./support');
  var jszipProto = require('./object');
  function ZipEntries(data, loadOptions) {
    this.files = [];
    this.loadOptions = loadOptions;
    if (data) {
      this.load(data);
    }
  }
  ZipEntries.prototype = {
    checkSignature: function(expectedSignature) {
      var signature = this.reader.readString(4);
      if (signature !== expectedSignature) {
        throw new Error("Corrupted zip or bug : unexpected signature " + "(" + utils.pretty(signature) + ", expected " + utils.pretty(expectedSignature) + ")");
      }
    },
    readBlockEndOfCentral: function() {
      this.diskNumber = this.reader.readInt(2);
      this.diskWithCentralDirStart = this.reader.readInt(2);
      this.centralDirRecordsOnThisDisk = this.reader.readInt(2);
      this.centralDirRecords = this.reader.readInt(2);
      this.centralDirSize = this.reader.readInt(4);
      this.centralDirOffset = this.reader.readInt(4);
      this.zipCommentLength = this.reader.readInt(2);
      this.zipComment = this.reader.readString(this.zipCommentLength);
      this.zipComment = jszipProto.utf8decode(this.zipComment);
    },
    readBlockZip64EndOfCentral: function() {
      this.zip64EndOfCentralSize = this.reader.readInt(8);
      this.versionMadeBy = this.reader.readString(2);
      this.versionNeeded = this.reader.readInt(2);
      this.diskNumber = this.reader.readInt(4);
      this.diskWithCentralDirStart = this.reader.readInt(4);
      this.centralDirRecordsOnThisDisk = this.reader.readInt(8);
      this.centralDirRecords = this.reader.readInt(8);
      this.centralDirSize = this.reader.readInt(8);
      this.centralDirOffset = this.reader.readInt(8);
      this.zip64ExtensibleData = {};
      var extraDataSize = this.zip64EndOfCentralSize - 44,
          index = 0,
          extraFieldId,
          extraFieldLength,
          extraFieldValue;
      while (index < extraDataSize) {
        extraFieldId = this.reader.readInt(2);
        extraFieldLength = this.reader.readInt(4);
        extraFieldValue = this.reader.readString(extraFieldLength);
        this.zip64ExtensibleData[extraFieldId] = {
          id: extraFieldId,
          length: extraFieldLength,
          value: extraFieldValue
        };
      }
    },
    readBlockZip64EndOfCentralLocator: function() {
      this.diskWithZip64CentralDirStart = this.reader.readInt(4);
      this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8);
      this.disksCount = this.reader.readInt(4);
      if (this.disksCount > 1) {
        throw new Error("Multi-volumes zip are not supported");
      }
    },
    readLocalFiles: function() {
      var i,
          file;
      for (i = 0; i < this.files.length; i++) {
        file = this.files[i];
        this.reader.setIndex(file.localHeaderOffset);
        this.checkSignature(sig.LOCAL_FILE_HEADER);
        file.readLocalPart(this.reader);
        file.handleUTF8();
        file.processAttributes();
      }
    },
    readCentralDir: function() {
      var file;
      this.reader.setIndex(this.centralDirOffset);
      while (this.reader.readString(4) === sig.CENTRAL_FILE_HEADER) {
        file = new ZipEntry({zip64: this.zip64}, this.loadOptions);
        file.readCentralPart(this.reader);
        this.files.push(file);
      }
    },
    readEndOfCentral: function() {
      var offset = this.reader.lastIndexOfSignature(sig.CENTRAL_DIRECTORY_END);
      if (offset === -1) {
        var isGarbage = true;
        try {
          this.reader.setIndex(0);
          this.checkSignature(sig.LOCAL_FILE_HEADER);
          isGarbage = false;
        } catch (e) {}
        if (isGarbage) {
          throw new Error("Can't find end of central directory : is this a zip file ? " + "If it is, see http://stuk.github.io/jszip/documentation/howto/read_zip.html");
        } else {
          throw new Error("Corrupted zip : can't find end of central directory");
        }
      }
      this.reader.setIndex(offset);
      this.checkSignature(sig.CENTRAL_DIRECTORY_END);
      this.readBlockEndOfCentral();
      if (this.diskNumber === utils.MAX_VALUE_16BITS || this.diskWithCentralDirStart === utils.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === utils.MAX_VALUE_16BITS || this.centralDirRecords === utils.MAX_VALUE_16BITS || this.centralDirSize === utils.MAX_VALUE_32BITS || this.centralDirOffset === utils.MAX_VALUE_32BITS) {
        this.zip64 = true;
        offset = this.reader.lastIndexOfSignature(sig.ZIP64_CENTRAL_DIRECTORY_LOCATOR);
        if (offset === -1) {
          throw new Error("Corrupted zip : can't find the ZIP64 end of central directory locator");
        }
        this.reader.setIndex(offset);
        this.checkSignature(sig.ZIP64_CENTRAL_DIRECTORY_LOCATOR);
        this.readBlockZip64EndOfCentralLocator();
        this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir);
        this.checkSignature(sig.ZIP64_CENTRAL_DIRECTORY_END);
        this.readBlockZip64EndOfCentral();
      }
    },
    prepareReader: function(data) {
      var type = utils.getTypeOf(data);
      if (type === "string" && !support.uint8array) {
        this.reader = new StringReader(data, this.loadOptions.optimizedBinaryString);
      } else if (type === "nodebuffer") {
        this.reader = new NodeBufferReader(data);
      } else {
        this.reader = new Uint8ArrayReader(utils.transformTo("uint8array", data));
      }
    },
    load: function(data) {
      this.prepareReader(data);
      this.readEndOfCentral();
      this.readCentralDir();
      this.readLocalFiles();
    }
  };
  module.exports = ZipEntries;
})(require('buffer').Buffer);
