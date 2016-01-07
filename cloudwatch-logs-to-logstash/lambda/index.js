const Logstash = require('./Logstash');
const zlib = require('zlib');

function logLineToJson(logLine) {
    try {
        const messageParts = logLine.message.split('\t');

        // filter log lines from standard lambda execution
        // log lines that include a timestamp have been explicitly generated with a call to console.log()
        if (! isNaN(Date.parse(messageParts[0]))) {
            const rawMessage = messageParts[messageParts.length - 1]
                .replace(/(')/gm, '"')
                .replace(/(\n)/gm, '');


            // `rawMessage` is a string that looks like
            // {message: "Downloading from ingest bucket", state: {Bucket "foo-bar"}}
            // As the keys in are not quoted, eval is the simplest way to convert to JSON.
            eval('const message = ' + rawMessage);

            console.log(message);

            return message;
        }
    }
    catch (err) {
        console.log(err);
    }
}

exports.handler = function(event, context) {
    const payload = new Buffer(event.awslogs.data, 'base64');

    zlib.gunzip(payload, function(e, result) {
        if (e) {
            context.fail(e);
        } else {
            result = JSON.parse(result.toString('utf8'));

            const records = result.logEvents.map(function (log) {
                const message = logLineToJson(log);

                if (message !== undefined) {
                    return {
                        Data: JSON.stringify(message),
                        PartitionKey: 'logs'
                    };
                }
            });

            const kinesisRecords = records.filter(function (r) {
                return r !== undefined;
            });

            if (kinesisRecords.length === 0) {
                context.succeed('Nothing to send to Kinesis');
            } else {
                console.log(kinesisRecords);
                Logstash.putRecords(context, kinesisRecords);
            }
        }
    });
};
