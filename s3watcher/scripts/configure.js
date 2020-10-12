const configLoader = require('./properties');
const AWS = require('aws-sdk');

AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'media-service'});

const configObject = configLoader.load('s3watcher');

const s3IngestBucket = configLoader.get(configObject, 's3.ingest.bucket');

const config = {
    region:      configLoader.get(configObject, 'aws.region'),
    baseUrl:     configLoader.get(configObject, 'loader.uri'),
    apiKey:      configLoader.get(configObject, 'auth.key.s3watcher'),
    failBucket:  configLoader.get(configObject, 's3.fail.bucket'),
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
