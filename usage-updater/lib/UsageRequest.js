const request = require('request');
const Rx = require('rx');

module.exports = {
    get: function(config, mediaUsage) {

        function getResult(response, data) {
            return {
                statusCode: response.statusCode,
                succeeded: response.statusCode == 200,
                usages: JSON.parse(data)
            }
        }

        const options = {
            url: mediaUsage.uri,
            headers: {
                'X-Gu-Media-Key': config.apiKey
            }
        };

        const uploadRequest = request.get(options);

        return Rx.Observable.create(function(observer){
            uploadRequest.on("response", function(response){
                response.on('data', function(data) {
                    observer.onNext(getResult(response, data));
                })
            });
            uploadRequest.on("error", observer.onError.bind(observer));
        });
    }
}
