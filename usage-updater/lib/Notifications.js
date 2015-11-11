const AWS = require('aws-sdk');
const Config = require('./Config');

module.exports = {
    publish: function (message) {
        const sns = new AWS.SNS({
            apiVersion: '2010-03-31',
            region: 'eu-west-1' //TODO is there an enum in the sdk?
        });

        sns.publish({
            TopicArn: Config.topicArn,
            Subject: 'usage-update',
            Message: JSON.stringify(message) //TODO won't work for complex json objects
        }, function (err, data) {
            err ? console.log(err, err.stack) : console.log(data);
        });
    }
};
