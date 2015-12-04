const AWS = require('aws-sdk');
const zlib = require('zlib');

const config = require('./config.json');

if (config.stage === 'DEV') {
    AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'media-service'});
}

const sts = new AWS.STS();

exports.handler = function(event, context) {
    const payload = new Buffer(event.awslogs.data, 'base64');

    zlib.gunzip(payload, function(e, result) {
        if (e) {
            context.fail(e);
        } else {
            result = JSON.parse(result.toString('utf8'));

            const logs = result.logEvents;
            const records = [];

            logs.forEach(function(log) {
                const messageParts = log.message.split('\t');

                if (! isNaN(Date.parse(messageParts[0]))) {
                    const rawMessage = messageParts[messageParts.length - 1]
                        .replace(/(')/gm, '"')
                        .replace(/(\n)/gm, '');

                    eval('const message = ' + rawMessage);
                    console.log(message);

                    records.push({
                        Data: JSON.stringify(message),
                        PartitionKey: 'logs'
                    });
                }
            });

            if (records.length === 0) {
                context.succeed('Nothing to send to Kinesis');
            } else {
                const roleRequest = sts.assumeRole({
                    RoleArn: config.roleArn,
                    RoleSessionName: 'cloudwatch-logs-to-logstash'
                });

                roleRequest.send(function (err, data) {
                    if (err) {
                        context.fail(err);
                    } else {
                        const kinesis = new AWS.Kinesis({
                            accessKeyId: data.Credentials.AccessKeyId,
                            secretAccessKey: data.Credentials.SecretAccessKey,
                            sessionToken: data.Credentials.SessionToken
                        });

                        const putRecordsRequest = kinesis.putRecords({
                            Records: records,
                            StreamName: config.streamName
                        });

                        console.log('Putting ' + records.length + ' records to Kinesis');

                        putRecordsRequest.send(function (err, data) {
                            if (err) {
                                context.fail(err);
                            } else {
                                context.succeed('Successfully processed ' + result.logEvents.length + ' log events.');
                            }
                        });
                    }
                });
            }
        }
    });
};
