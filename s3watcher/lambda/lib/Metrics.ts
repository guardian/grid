import { PutMetricDataInput } from "aws-sdk/clients/cloudwatch"
import { UploadResult } from "./GridApi"

export const createMetric = function (uploadResult: UploadResult): PutMetricDataInput {
    const metricName = uploadResult.succeeded ?
        "UploadedImages" : "FailedUploads"

    const dimensions = [{
        "Name" : "UploadedBy",
        "Value" : uploadResult.uploadedBy
    }]

    const timestamp = new Date

    return {
        MetricData: [{
            MetricName: metricName,
            Dimensions: dimensions,
            Timestamp: timestamp,
            Unit: "Count",
            Value: 1
        },
        {
            MetricName: metricName,
            Timestamp: timestamp,
            Unit: "Count",
            Value: 1
        }],
        Namespace: uploadResult.stage + "/S3watcher"
    }
}
