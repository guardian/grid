const AWS = require('aws-sdk');

const Config = require('./Config');
const SNSHelper = require('./SNSHelper');


module.exports = {
    publish: function (message) {
        return SNSHelper.publish({
            TopicArn: Config.topicArn,
            Subject: Config.messageSubject,
            Message: JSON.stringify(message)
        });
    }
};
