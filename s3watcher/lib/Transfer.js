const S3Helper     = require('./S3Helper');
const CWHelper     = require('./CWHelper');
const Metrics      = require('./Metrics');
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

        function log(key, state) {
            const messages = {
                "download": "Downloading from ingest bucket.",
                "upload": "Uploading to image-loader.",
                "delete": "Deleting from ingest bucket.",
                "copy": "Copying to fail bucket.",
                "record": "Recording result to Cloudwatch",
                "failed": "Upload failed."
            };

            const stateMessage = messages[key] || "An error has occured";

            console.log(stateMessage, state);
        }

       const success = function(result) {
            log("delete", s3Object);

            return S3Helper.deleteS3Object(s3Object);
        };

        const failGraceful = function(e) {
            log("failed", e);

            log("copy", s3CopyObject);
            return S3Helper.copyS3Object(s3CopyObject).flatMap(function(){
                log("delete", s3Object);

                return S3Helper.deleteS3Object(s3Object);
            });
        };

        // TODO: Use stream API
        const operation = function() {
            log("download", s3Object);

            return S3Helper.getS3Object(s3Object).flatMap(function(data){
                log("upload", upload);

                return Upload.postData(upload, data.Body)
            }).retry(5).flatMap(function(uploadResult){
                log("record", uploadResult)

                return CWHelper.putMetricData(
                    Metrics.create(uploadResult)).map(
                        function(){ return uploadResult; });

            }).flatMap(function(uploadResult){
                return uploadResult.succeeded ? success() : failGraceful()
            });
        };

        return {
            operation: operation,
            success: success,
            fail: failGraceful
        };
    }
}
