// dependencies
var async = require('async');
var AWS = require('aws-sdk');
var util = require('util');
var request = require('request');
var fs = require('fs');

// get reference to S3 client
var s3 = new AWS.S3();

exports.handler = function(event, context) {
    var srcBucket = event.Records[0].s3.bucket.name;
    var srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    var splitSrcKey = srcKey.split("/");
    var simpleKey = splitSrcKey[(splitSrcKey.length - 1)]

    // Download the image from S3 and upload it to image loader
    async.waterfall([
        function download(next) {
            // Download the image from S3 into a buffer.

            var filename = '/tmp/' + simpleKey;
            var file = require('fs').createWriteStream(filename);

            s3.getObject({
                Bucket: srcBucket,
                Key: srcKey
            }).createReadStream().pipe(file).on('end', function() {
                console.log("foo");
                next(null, filename);
            });
        },
        function upload(filename, next) {
            console.log('up');
            // Stream the image to the image loader

            var fileStream = fs.createReadStream(filename);

            var stats = fs.statSync(filename);
            var fileSizeInBytes = stats["size"]

            var baseUrl = "https://loader.media.test.dev-gutools.co.uk"
            // TODO: Get configurable properties from outside script (i.e. URL, api-token)
            var options = {
                url: baseUrl + "/images?filename=" + filename,
                headers: {
                    'Content-Length': fileSizeInBytes
                }
            };

            fileStream.pipe(
                request.post(options).on('response', function(response) {
                    console.log(response.statusCode)
                })
            );
        }
        ], function (err) {
            if (err) {
                console.error('Failed:' + err);
                // TODO: Move failed uploads to failed bucket
            } else {
                console.log('Success!');
                // TODO: Delete successful uploads
            }

            context.done();
        }
    );
};
