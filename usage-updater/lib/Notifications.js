const AWS = require('aws-sdk');

const Config = require('./Config');
const SNSHelper = require('./SNSHelper');


module.exports = {
    publish: function (usages, id) {
        const message = JSON.stringify({
            id: id,
            data: usages.data
        });

        return SNSHelper.publish({
            TopicArn: Config.topicArn,
            Subject: Config.messageSubject,
            Message: message
        });
    }
};
