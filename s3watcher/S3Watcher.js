// dependencies
var async = require('async');
var AWS = require('aws-sdk');
var util = require('util');
var request = require('request');
var fs = require('fs');

// get reference to S3 client
var s3 = new AWS.S3();

exports.handler = function(event, context) {
    // Read options from the event.
    console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));

    var srcBucket = event.Records[0].s3.bucket.name;

    // Object key may have spaces or unicode non-ASCII characters.
    var srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

    // Download the image from S3 and upload it to image loader
    async.waterfall([
        function download(next) {
            // Download the image from S3 into a buffer.
            s3.getObject({
                    Bucket: srcBucket,
                    Key: srcKey
                },
                next);
            },
        function upload(response, next) {
            // Stream the image to the image loader

            // TODO: Get configurable properties from outside script (i.e. URL, api-token)
            var options = {
                url: 'http://www.example.com',
                headers: { 'X-Secret': 'api-token' }
            };

            response.createReadStream().pipe(request.put(options))

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
