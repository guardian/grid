const Logstash = require('./Logstash');
const zlib = require('zlib');

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
                Logstash.putRecords(context, records);
            }
        }
    });
};
