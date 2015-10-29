const AWS = require('aws-sdk');
const Rx = require('rx');

const cw = new AWS.CloudWatch();


module.exports = {
    putMetricData: Rx.Observable.fromNodeCallback(cw.putMetricData, cw),
}
