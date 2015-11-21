const Rx = require('rx');
const Notifications = require('./lib/Notifications');
const Lambda        = require('./lib/Lambda');
const UsageRequest  = require('./lib/UsageRequest');


exports.handler = function(event, context) {
    //console.log('Received event:', JSON.stringify(event, null, 2));
    const lambda = Lambda.init(event, context);

    const update = lambda.event.flatMap(function(mediaUsage){
        return UsageRequest.get(lambda.config, mediaUsage).flatMap(function(response){
            return Notifications.publish(response.usages, mediaUsage.id);
        });
    });

    update.subscribe(
        lambda.success,
        lambda.fail
    );
};
