const Rx = require('rx');


exports.handler = function(event, context) {
    //console.log('Received event:', JSON.stringify(event, null, 2));
    event.Records.forEach(function(record) {

        console.log(record.dynamodb.NewImage.media_id.S);
    });
    context.succeed("Successfully processed " + event.Records.length + " records.");
};
