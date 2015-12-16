const AWS = require('aws-sdk');
const Rx = require('rx');


function CWHelper(options) {
    const cw = new AWS.CloudWatch(options);

    return {
        putMetricData: Rx.Observable.fromNodeCallback(cw.putMetricData, cw)
    };
}

module.exports = CWHelper;
