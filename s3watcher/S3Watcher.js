const Rx = require('rx');

const Lambda   = require('./lib/Lambda');
const Transfer = require('./lib/Transfer');


exports.handler = function(event, context) {

    const lambda   = Lambda.init(event, context);

    const transfer = lambda.config.map(function(config){
        return Transfer.init(lambda.s3Event, config);
    });

    transfer.flatMap(function(t){
        return t.operation().catch(function(e){
            return t.fail(e);
        }).flatMap(t.success);
    }).subscribe(
        lambda.success,
        lambda.fail
    );

};
