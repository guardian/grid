const properties = require('./properties');
const AWS = require('aws-sdk');

const props = properties.load('s3watcher');

const s3IngestBucket = props['s3.ingest.bucket'];

const config = {
    baseUrl:     props['loader.uri'],
    apiKey:      props['auth.key.s3watcher'],
    failBucket:  props['s3.fail.bucket'],
    s3UrlExpiry: 60,
    stage:       'DEV'
};
const configJson = JSON.stringify(config, null, 2);

const s3 = new AWS.S3({});
console.log('Writing to s3://' +s3IngestBucket+ '/config.json');

s3.putObject({
    Bucket: s3IngestBucket,
    Key: 'config.json',
    Body: configJson
}, function(err, data) {
    if (err) {
        console.error("Failed to upload: ", err);
        process.exit(1);
    }

    console.log('Done');
});
