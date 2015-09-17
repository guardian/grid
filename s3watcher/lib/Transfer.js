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

        function log(state) {
            const states = {
                "download": {
                    message: "Downloading from ingest bucket.",
                    state: s3Object
                },
                "upload": {
                    message: "Uploading to image-loader.",
                    state: upload
                },
                "delete": {
                    message: "Deleting from ingest bucket.",
                    state: s3Object
                },
                "copy": {
                    message: "Copying to fail bucket.",
                    state: s3CopyObject
                }
            };

            const stateMessage = states[state].message;
            const stateObject  = states[state].state;

            console.log(stateMessage, stateObject);
        }

        // TODO: Use stream API
        const operation = function() {
            log("download");

            return S3Helper.getS3Object(s3Object).flatMap(function(data){
                log("upload");

                return Upload.postData(upload, data.Body)
            }).retry(3);
        };

        const success = function(result) {
            log("delete");

            return S3Helper.deleteS3Object(s3Object);
        };

        const fail = function() {
            log("copy");

            return S3Helper.copyS3Object(s3CopyObject).flatMap(function(){
                log("delete");

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
