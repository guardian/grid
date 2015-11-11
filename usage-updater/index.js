const Rx = require('rx');

const Lambda       = require('./lib/Lambda');
const UsageRequest = require('./lib/UsageRequest');


exports.handler = function(event, context) {
    //console.log('Received event:', JSON.stringify(event, null, 2));
    const lambda = Lambda.init(event, context);

    const update = lambda.event.flatMap(function(mediaUsage){
        return UsageRequest.get(lambda.config, mediaUsage).map(function(response){
            console.log(response);
        });
    });

    update.subscribe(
        lambda.success,
        lambda.fail
    );
};
