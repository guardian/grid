const Rx = require('rx');
const S3Helper = require('./S3Helper');


module.exports = {
    init: function(event, context) {
        const buildS3Event = function(event) {
            const e = event.Records[0].s3;

            const normaliseKey = function(key) {
                return decodeURIComponent(key.replace(/\+/g, " "));
            };
            const srcKey = normaliseKey(e.object.key);
            const srcBucket = e.bucket.name;
            const srcSize = e.object.size;

            const path =  srcKey.split("/");

            const filenameFromKey = function(key) {
                return path[(path.length - 1)];
            }
            const srcFilename = filenameFromKey(srcKey);

            return {
                bucket: srcBucket,
                path: path,
                key: srcKey,
                filename: srcFilename,
                size: srcSize
            };
        };

        const s3Event = buildS3Event(event);

        const noConfigError = Rx.Observable.throw(
                new Error("Config file missing."));

        const configParseError = Rx.Observable.throw(
                new Error("Config invalid JSON."));

        function parseJson(data) {
            try {
                const obj = JSON.parse(data);
                return Rx.Observable.return(obj);
            } catch (e) {
                return configParseError;
            }
        }

        const config = S3Helper.getS3Object({
            Bucket: s3Event.bucket,
            Key: "config.json"
        }).catch(noConfigError).flatMap(function(data){
            return parseJson(data.Body.toString());
        });

        const fail = function(err) {
            context.fail(err);
        };

        const success = function() {
            console.log("Finished successfully.", s3Event);
            context.succeed(s3Event);
        };

        return {
            s3Event: s3Event,
            config: config,
            fail: fail,
            success: success
        };
    }
}
