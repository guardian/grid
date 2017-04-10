const properties = require('./properties');
const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');


if (process.argv.length < 4) {
    console.error('usage: prepare.js <input-image> <output-event>');
    process.exit(1);
}

const props = properties.load('s3watcher');
const s3IngestBucket = props['s3.ingest.bucket'];

const testFile = process.argv[2];
const eventFile = process.argv[3];

const fd = fs.openSync(testFile, 'r');
const stats = fs.fstatSync(fd);
const data = fs.readFileSync(testFile);
const fileSize = stats.size;

const s3Folder = 'test';
const filename = path.basename(testFile);
const s3Key = path.join(s3Folder, filename);

// Corresponding S3 event structure
const event = {
    "Records": [{
        "s3": {
            "bucket": {
                "name": s3IngestBucket
            },
            "object": {
                "key": s3Key,
                "size": fileSize
            }
        }
    }]
};
const eventJson = JSON.stringify(event, null, 2);

AWS.config.update({
    credentials: new AWS.SharedIniFileCredentials({profile: 'media-service'}),
    region: 'eu-west-1'
});

const s3 = new AWS.S3({});
console.log('Uploading ' + testFile + ' to s3://' +s3IngestBucket+ '/' +s3Key);

s3.putObject({
    Bucket: s3IngestBucket,
    Key: s3Key,
    Body: data,
    ContentLength: fileSize
}, function(err, data) {
    if (err) {
        console.error("Failed to upload: ", err);
        process.exit(1);
    }

    // Write event.json file
    fs.writeFileSync(eventFile, eventJson, 'utf-8');

    console.log('Event written to ' + eventFile);
});
