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
    var simpleKey = splitSrcKey[(splitSrcKey.length - 1)];
    var filename = '/tmp/' + simpleKey;

    // TODO: Constants we want set from elsewhere!
    var baseUrl = "nope";
    var apiKey = "nope";
    var failBucket = "nope"

    var uploadUrl = baseUrl + "/images?filename=" + simpleKey;

    var objectParams = {
        Bucket: srcBucket,
        Key: srcKey
    }

    var failedObjectParams = {
        CopySource: srcBucket + "/" + srcKey,
        Bucket: failBucket,
        Key: srcKey
    };

    var deleteObject = function(obj) {
        s3.deleteObject(objectParams, function(err) {
            if (err) {
                console.log("Failed to delete source: " + err);
                context.fail(err)
            } else {
                console.log('Source image deleted');
                context.done();
            }
        });
    };

    async.waterfall([
        function download(next) {
            // Download the image from S3 and upload it to image loader
            console.log('Downloading image: ' + srcKey);

            var fileStream = fs.createWriteStream(filename);

            s3.getObject({
                Bucket: srcBucket,
                Key: srcKey
            }).on('error', function(err) {
                console.log('Downloading from S3 failed');
                next(err);
            }).createReadStream()
                .pipe(fileStream)
                .on('error', function(err) {
                    console.log("Writing to local filesystem failed");
                    next(err);
                })
                .on('close', function() {
                    console.log("Download complete");
                    next(null, filename);
                });

        },
        function upload(filename, next) {
            // Stream the image to the image loader
            console.log('Starting upload to ' + uploadUrl);

            var fileStream = fs.createReadStream(filename);
            var stats = fs.statSync(filename);
            var fileSizeInBytes = stats["size"]

            var uploadHeaders = {
                'Content-Length': fileSizeInBytes,
                'X-Gu-Media-Key': apiKey
            };

            var options = {
                url: uploadUrl,
                headers: uploadHeaders
            };

            fileStream.pipe(
                request.post(options).on('response', function(response) {
                    if(response.statusCode == 202) {
                        next();
                    } else {
                        next("Failed to upload with status code:" + response.statusCode);
                        s3.copyObject(failedObjectParams, function(err) {
                            if (err) {
                                console.log("Failed copying object to fail bucket");
                                next(err);
                            } else {
                                deleteObject(objectParams);
                            }
                        });
                    }
                })
            );
        }
        ], function (err) {
            if (err) {
                context.fail(err);
            } else {
                console.log('Successful upload');
                deleteObject(objectParams);
            }
        }
    );
};
