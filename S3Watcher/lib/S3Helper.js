const AWS = require('aws-sdk');
const Rx = require('rx');

const s3 = new AWS.S3();


module.exports = {
    deleteS3Object: Rx.Observable.fromNodeCallback(s3.deleteObject, s3),
    copyS3Object: Rx.Observable.fromNodeCallback(s3.copyObject, s3),
    getS3Object: Rx.Observable.fromNodeCallback(s3.getObject, s3)
}
