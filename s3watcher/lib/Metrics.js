module.exports = {
    create: function (uploadResult) {
        const metricName = uploadResult.succeeded ?
            "UploadedImages" : "FailedUploads";

        const dimensions = [{
            "Name" : "UploadedBy",
            "Value" : uploadResult.uploadedBy
        }]

        return {
            MetricData: [{
                MetricName: metricName,
                Dimensions: dimensions,
                Timestamp: new Date,
                Unit: "Count",
                Value: 1
            },
            {
                MetricName: metricName,
                Timestamp: new Date,
                Unit: "Count",
                Value: 1
            }],
            Namespace: uploadResult.stage + "/S3watcher"
        };
    }
}
