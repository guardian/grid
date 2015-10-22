module.exports = {
    create: function (uploadResult) {
        const metricName = uploadResult.succeeded ?
            "UploadedImages" : "FailedUploads";

        const dimensions = uploadResult.succeeded ?
            [{
                "Name" : "UploadedBy",
                "Value" : uploadResult.uploadedBy
            }] : [];

        return {
            MetricData: [{
                MetricName: metricName,
                Dimensions: dimensions,
                Timestamp: new Date,
                Unit: "Count",
                Value: 1
            }],
            Namespace: uploadResult.stage + "/S3watcher"
        };
    }
}
