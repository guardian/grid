import { time } from "console"
import { UploadResult } from "../lib/GridApi"
import { createMetric } from "../lib/Metrics"

test("creation of a metric on successful upload", () => {
  const result: UploadResult = {
    statusCode: 202,
    succeeded: true,
    uploadedBy: "SupplierOne",
    stage: "TEST",
  }

  const timestamp = new Date()

  const metricData = createMetric(result, timestamp)
  expect(metricData.Namespace).toEqual("TEST/S3watcher")
  expect(metricData.MetricData.length).toEqual(2)

  const metricWithDim = metricData.MetricData.find(
    (m) => m.Dimensions !== undefined
  )
  expect(metricWithDim?.MetricName).toEqual("UploadedImages")
  expect(metricWithDim?.Dimensions).toEqual([
    { Name: "UploadedBy", Value: "SupplierOne" },
  ])
  expect(metricWithDim?.Timestamp).toEqual(timestamp)
  expect(metricWithDim?.Unit).toEqual("Count")
  expect(metricWithDim?.Value).toBe(1)

  const metricNoDim = metricData.MetricData.find(
    (m) => m.Dimensions === undefined
  )
  expect(metricNoDim?.MetricName).toEqual("UploadedImages")
  expect(metricNoDim?.Dimensions).toBeUndefined()
  expect(metricNoDim?.Timestamp).toEqual(timestamp)
  expect(metricNoDim?.Unit).toEqual("Count")
  expect(metricNoDim?.Value).toBe(1)
})

test("creation of a metric on failued upload", () => {
  const result: UploadResult = {
    statusCode: 500,
    succeeded: false,
    uploadedBy: "SupplierOne",
    stage: "TEST",
  }

  const timestamp = new Date()

  const metricData = createMetric(result, timestamp)
  expect(metricData.Namespace).toEqual("TEST/S3watcher")
  expect(metricData.MetricData.length).toEqual(2)

  const metricWithDim = metricData.MetricData.find(
    (m) => m.Dimensions !== undefined
  )
  expect(metricWithDim?.MetricName).toEqual("FailedUploads")
  expect(metricWithDim?.Dimensions).toEqual([
    { Name: "UploadedBy", Value: "SupplierOne" },
  ])
  expect(metricWithDim?.Timestamp).toEqual(timestamp)
  expect(metricWithDim?.Unit).toEqual("Count")
  expect(metricWithDim?.Value).toBe(1)

  const metricNoDim = metricData.MetricData.find(
    (m) => m.Dimensions === undefined
  )
  expect(metricNoDim?.MetricName).toEqual("FailedUploads")
  expect(metricNoDim?.Dimensions).toBeUndefined()
  expect(metricNoDim?.Timestamp).toEqual(timestamp)
  expect(metricNoDim?.Unit).toEqual("Count")
  expect(metricNoDim?.Value).toBe(1)
})
