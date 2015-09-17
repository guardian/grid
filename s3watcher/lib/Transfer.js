const S3Helper     = require('./S3Helper');
const Upload       = require('./Upload');


module.exports = {
    init: function(s3Event, config){
        const objectKey = s3Event.bucket + "/" +  s3Event.key;
        const s3Object = {
            Bucket: s3Event.bucket,
            Key: s3Event.key
        };
        const s3CopyObject = {
            CopySource: s3Event.bucket + "/" + s3Event.key,
            Bucket: config.failBucket,
            Key: s3Event.key
        };
        const upload = Upload.buildUpload(config, s3Event);

        const logDownload = function(){
            console.log("Downloading from ingest bucket.", s3Object);
        };
        const logUpload = function(){
            console.log("Uploading to image-loader.", upload);
        };
        const logDelete = function(){
            console.log("Deleting from ingest bucket.", s3Object);
        };
        const logCopy = function(){
            console.log("Copying to fail bucket.", s3CopyObject);
        };

        // TODO: Pipe download stream into upload stream
        // Currently the whole file is loaded into memory before
        // being uploaded to the image loader.
        const operation = function() {
            logDownload();

            return S3Helper.getS3Object(s3Object).flatMap(function(data){
                logUpload();

                return Upload.postData(upload, data.Body)
            }).retry(3);
        };

        const success = function(result) {
            logDelete();

            return S3Helper.deleteS3Object(s3Object);
        };

        const fail = function() {
            logCopy();
            return S3Helper.copyS3Object(s3CopyObject).flatMap(function(){
                logDelete();
                return S3Helper.deleteS3Object(s3Object);
            });
        };

        return {
            operation: operation,
            success: success,
            fail: fail
        };
    }
}
