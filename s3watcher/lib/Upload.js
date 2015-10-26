const request = require('request');
const Rx = require('rx');


module.exports = {
    buildUpload: function(config, s3Event) {
         const headers = {
            'Content-Length': s3Event.size,
            'Content-Type': 'application/octet-stream',
            'X-Gu-Media-Key': config.apiKey
        };

         const buildUploadedBy = function(path){
             if(path.length > 1) {
                 return path[0];
             } else {
                 throw new Error("File uploaded to root folder.");
             }
         };

         const uploadedBy = buildUploadedBy(s3Event.path);

         return  {
             key: config.apiKey,
             url: config.baseUrl,
             path: "/images",
             size: s3Event.size,
             headers: headers,
             params: {
                 filename: s3Event.filename,
                 uploadedBy: uploadedBy,
                 stage: config.stage
             }
         };
    },
    postData: function(upload, data) {
        function uploadResult(response) {
            return {
                statusCode: response.statusCode,
                succeeded: response.statusCode == 202,
                uploadedBy: upload.params.uploadedBy,
                stage: upload.params.stage
            }
        }

        const url = upload.url + upload.path;
        const options = {
            url: url,
            headers: upload.headers,
            body: data,
            qs: upload.params
        };

        const uploadRequest = request.post(options);

        return Rx.Observable.create(function(observer){
            uploadRequest.on("response", function(response){
                observer.onNext(uploadResult(response));
            });
            uploadRequest.on("error", observer.onError.bind(observer));
        });
    }
}
