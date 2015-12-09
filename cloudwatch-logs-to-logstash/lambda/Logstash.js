const AWS = require('aws-sdk');

const config = require('./config');

if (config.stage === 'DEV') {
    AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'media-service'});
}

module.exports = {
    putRecords: function (context, records) {
        const sts = new AWS.STS();

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
                        context.succeed('Successfully processed ' + records.length + ' log events.');
                    }
                });
            }
        });
    }
};
