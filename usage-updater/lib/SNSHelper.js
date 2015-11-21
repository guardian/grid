const AWS = require('aws-sdk');

const Rx = require('rx');
const Config = require('./Config');

const sns = new AWS.SNS({
    apiVersion: '2010-03-31',
    region: Config.region
});


module.exports = {
    publish: Rx.Observable.fromNodeCallback(sns.publish, sns)
}
