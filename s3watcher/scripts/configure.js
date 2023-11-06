const configLoader = require('./configLoader');
const AWS = require('aws-sdk');

const {
    fromIni
} = require("@aws-sdk/credential-providers");

// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
AWS.config.credentials = // JS SDK v3 switched credential providers from classes to functions.
// This is the closest approximation from codemod of what your application needs.
// Reference: https://www.npmjs.com/package/@aws-sdk/credential-providers
fromIni({profile: 'media-service'});

const configObject = configLoader.load('s3Watcher');

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

const s3 = configLoader.s3Client(config.region);
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
