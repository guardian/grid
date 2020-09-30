import { PutMetricDataInput } from "aws-sdk/clients/cloudwatch"
import { UploadResult } from "./GridApi"

export const createMetric = function (
  uploadResult: UploadResult,
  timestamp: Date
): PutMetricDataInput {
  const metricName = uploadResult.succeeded ? "UploadedImages" : "FailedUploads"

  const dimensions = [
    {
      Name: "UploadedBy",
      Value: uploadResult.uploadedBy,
    },
  ]

  return {
    MetricData: [
      {
        MetricName: metricName,
        Dimensions: dimensions,
        Timestamp: timestamp,
        Unit: "Count",
        Value: 1,
      },
      {
        MetricName: metricName,
        Timestamp: timestamp,
        Unit: "Count",
        Value: 1,
      },
    ],
    Namespace: uploadResult.stage + "/S3watcher",
  }
}
