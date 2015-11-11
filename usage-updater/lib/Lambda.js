const Rx = require('rx');
const Config = require('./Config');


module.exports = {
    init: function(event, context) {

        function buildKinesisUsageEvent(event) {
            return Rx.Observable.from(event.Records.map(function(record) {
                const mediaId = record.dynamodb.NewImage.media_id.S;
                const baseUrl = Config.usageBaseUri;

                return {
                    "uri" : baseUrl + mediaId
                }
            }));
        }

        const kinesisUsageEvent = buildKinesisUsageEvent(event);

        const fail = function(err) {
            context.fail(err);
        };

        const success = function() {
            console.log("Finished successfully.", event);
            context.succeed(event);
        };

        return {
            event: kinesisUsageEvent,
            config: Config,
            fail: fail,
            success: success
        };
    }
}
