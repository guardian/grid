const S3Helper     = require('./S3Helper');
const CWHelper     = require('./CWHelper');
const Metrics      = require('./Metrics');
const Upload       = require('./Upload');
const Logger       = require('./Logger');

module.exports = {
    init: function(s3Event, config){

        const cloudwatch = new CWHelper({region: config.region});

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

        const success = function() {
            Logger.logDelete(config.stage, s3Object);

            return S3Helper.deleteS3Object(s3Object);
        };

        const failGraceful = function(e) {
            Logger.logImportFail(config.stage, e);
            Logger.logCopyToFailBucket(config.stage, s3CopyObject);

            return S3Helper.copyS3Object(s3CopyObject).flatMap(function(){
                Logger.logDelete(config.stage, s3Object);

                return S3Helper.deleteS3Object(s3Object);
            });
        };

        // TODO: Use stream API
        const operation = function() {
            Logger.logImport(config.stage, s3Object);

            const urlExpiryInSeconds = config.s3UrlExpiry;
            const signedUrl = S3Helper.getSignedUrl('getObject', {
                Bucket: s3Object.Bucket,
                Key: s3Object.Key,
                Expires: urlExpiryInSeconds
            });

            return Upload.
                postUri(upload, signedUrl).
                retry(5).
                flatMap(function(uploadResult){
                    Logger.logRecordToCloudWatch(config.stage, uploadResult);

                    return cloudwatch.putMetricData(
                        Metrics.create(uploadResult)).map(uploadResult);

                }).flatMap(function(uploadResult){
                    return uploadResult.succeeded ? success() : failGraceful();
                });
        };

        return {
            operation: operation,
            success: success,
            fail: failGraceful
        };
    }
};
