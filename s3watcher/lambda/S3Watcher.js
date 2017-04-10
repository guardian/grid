const Rx = require('rx');

const Lambda   = require('./lib/Lambda');
const Transfer = require('./lib/Transfer');
const AWS = require('aws-sdk');

exports.handler = function(event, context) {
    const stage = process.env.STAGE || 'DEV';

    if (stage === 'DEV') {
        AWS.config.update({
            credentials: new AWS.SharedIniFileCredentials({profile: 'media-service'}),
            region: 'eu-west-1'
        });
    }

    const lambda   = Lambda.init(event, context);

    const transfer = lambda.config.map(function(config){
        return Transfer.init(lambda.s3Event, config);
    });

    const duplicateTransfer = function(err) {
        const failState = err && (err.code === 'NotFound' || err.code === 'NoSuchKey');
        const failComplete = Rx.Observable.return("No source file.");

        return failState ? failComplete : Rx.Observable.throw(err);
    };

    transfer.flatMap(function(t){
        return t.operation();
    }).catch(duplicateTransfer).subscribe(
        lambda.success,
        lambda.fail
    );

};
