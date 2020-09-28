const Rx = require('rx');

const Lambda   = require('./lib/Lambda');
const Transfer = require('./lib/Transfer');
const AWS = require('aws-sdk');
const EnvironmentConfig = require('./lib/environment-config');
const ELKKinesisLogger = require('@guardian/elk-kinesis-logger');

exports.handler = function(event, context) {
    if (EnvironmentConfig.isDev) {
        AWS.config.update({
            credentials: new AWS.SharedIniFileCredentials({profile: 'media-service'}),
            region: 'eu-west-1'
        });
    }

    const logger = new ELKKinesisLogger({
        stage: EnvironmentConfig.stage,
        stack: EnvironmentConfig.stack,
        app: EnvironmentConfig.app,
        roleArn: EnvironmentConfig.loggingRoleArn,
        streamName: EnvironmentConfig.loggingStream
    });

    logger.open().then(() => {
        logger.log('ELKKinesisLogger started');
        const lambda   = Lambda.init(event, context, logger);

        const transfer = lambda.config.map(function(config){
            return Transfer.init(lambda.s3Event, config, logger);
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
    });
};
