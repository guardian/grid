const S3Helper     = require('./S3Helper');
const Upload       = require('./Upload');


module.exports = {
    init: function(s3Event, config){
        // TODO: Pipe download stream into upload stream
        // Currently the whole file is loaded into memory before
        // being uploaded to the image loader.
        //
        const operation = function() {
            console.log("Downloading from ingest bucket.");

            const upload = Upload.buildUpload(config, s3Event);

            return S3Helper.getS3Object({
                Bucket: s3Event.bucket,
                Key: s3Event.key
            }).flatMap(function(data){
                console.log("Uploading to image-loader.");

                return Upload.postData(upload, data.Body)
            }).retry(3);
        };

        const success = function(result) {
            console.log("Deleting from ingest bucket.");
            return S3Helper.deleteS3Object({
                Bucket: s3Event.bucket,
                Key: s3Event.key
            });
        };

        const fail = function() {
            console.log("Copying to fail bucket.");
            return S3Helper.copyS3Object({
                CopySource: s3Event.bucket + "/" + s3Event.key,
                Bucket: config.failBucket,
                Key: s3Event.key
            }).flatMap(function(){
                console.log("Deleting from ingest bucket.");
                return S3Helper.deleteS3Object({
                    Bucket: s3Event.bucket,
                    Key: s3Event.key
                });
            });
        };

        return {
            operation: operation,
            success: success,
            fail: fail
        };
    }
}
