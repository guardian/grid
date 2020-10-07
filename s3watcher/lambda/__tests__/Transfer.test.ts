import { S3, CloudWatch } from "aws-sdk"
import { transfer } from "../lib/Transfer"
import {
  copyObjectPromise,
  deleteObjectPromise,
  getSignedUrlPromisePromise,
  putDataPromise,
  resetMocks,
} from "../__mocks__/aws-sdk"
import { action, createMockLogger, ingestConfig } from "./Fixtures"

beforeEach(() => {
  resetMocks()
})

test("transfer successfully coordinates a transfer", async () => {
  const logger = createMockLogger({ loggerKey: "LoggerValue" })
  const s3Client = new S3()
  const cloudwatch = new CloudWatch()
  getSignedUrlPromisePromise.mockReturnValueOnce(
    "https://s3.monkey.com/blah/blah"
  )
  putDataPromise.mockResolvedValueOnce("OK")
  deleteObjectPromise.mockResolvedValueOnce("OK")
  const importAction = jest.fn().mockReturnValueOnce({ succeeded: true })
  const result = transfer(
    logger,
    s3Client,
    cloudwatch,
    importAction,
    action,
    ingestConfig
  )
  await expect(result).resolves.toEqual({"succeeded": true})
  expect(s3Client.getSignedUrlPromise).toHaveBeenCalledWith("getObject", {
    Bucket: "import-bucket",
    Expires: 60,
    Key: "SupplierName/image-to-import.jpg",
  })
  expect(cloudwatch.putMetricData).toHaveBeenCalled()
  expect(s3Client.copyObject).not.toHaveBeenCalledWith({
    Bucket: "import-bucket",
    Key: "SupplierName/image-to-import.jpg",
  })
  expect(s3Client.deleteObject).toHaveBeenCalledWith({
    Bucket: "import-bucket",
    Key: "SupplierName/image-to-import.jpg",
  })
  // check there are no errors
  expect(logger.getWarningsAndErrors()).toHaveLength(0)
})

test("transfer deals with a failed transfer", async () => {
  const logger = createMockLogger({ loggerKey: "LoggerValue" })
  const s3Client = new S3()
  const cloudwatch = new CloudWatch()
  getSignedUrlPromisePromise.mockReturnValueOnce(
    "https://s3.monkey.com/blah/blah"
  )
  putDataPromise.mockResolvedValueOnce("OK")
  copyObjectPromise.mockResolvedValueOnce("OK")
  deleteObjectPromise.mockResolvedValueOnce("OK")
  const importAction = jest.fn().mockReturnValueOnce({ succeeded: false })
  const result = transfer(
    logger,
    s3Client,
    cloudwatch,
    importAction,
    action,
    ingestConfig
  )
  await expect(result).rejects.toThrowError()
  expect(s3Client.getSignedUrlPromise).toHaveBeenCalled()
  expect(cloudwatch.putMetricData).toHaveBeenCalled()
  expect(s3Client.copyObject).toHaveBeenCalled()
  expect(s3Client.deleteObject).toHaveBeenCalled()
  expect(logger.getWarningsAndErrors()).toHaveLength(1)
  expect(logger.getWarningsAndErrors().map((l) => l.message)).toContain(
    'Import failed, copying to failure bucket {"CopySource":"import-bucket/SupplierName/image-to-import.jpg","Bucket":"grid-failure-bucket","Key":"SupplierName/image-to-import.jpg"}'
  )
})

test("transfer completes even if the cloudwatch metric fails", async () => {
  const logger = createMockLogger({ loggerKey: "LoggerValue" })
  const s3Client = new S3()
  const cloudwatch = new CloudWatch()
  getSignedUrlPromisePromise.mockReturnValueOnce(
    "https://s3.monkey.com/blah/blah"
  )
  putDataPromise.mockRejectedValue(new Error("Cloudwatch broken"))
  deleteObjectPromise.mockResolvedValueOnce(undefined)
  const importAction = jest.fn().mockReturnValueOnce({ succeeded: true })

  const result = transfer(
    logger,
    s3Client,
    cloudwatch,
    importAction,
    action,
    ingestConfig
  )
  await expect(result).resolves.toEqual({"succeeded": true})
  expect(s3Client.getSignedUrlPromise).toHaveBeenCalled()
  expect(cloudwatch.putMetricData).toHaveBeenCalled()
  expect(s3Client.copyObject).not.toHaveBeenCalled()
  expect(s3Client.deleteObject).toHaveBeenCalled()
  expect(logger.getWarningsAndErrors()).toHaveLength(1)
  expect(logger.getWarningsAndErrors().map((l) => l.message)).toContain(
    "Error whilst recording cloudwatch metrics"
  )
})

test("transfer leaves deleted object if dead lettering fails", async () => {
  const logger = createMockLogger({ loggerKey: "LoggerValue" })
  const s3Client = new S3()
  const cloudwatch = new CloudWatch()
  getSignedUrlPromisePromise.mockReturnValueOnce(
    "https://s3.monkey.com/blah/blah"
  )
  copyObjectPromise.mockRejectedValue(new Error("Copy failed"))
  putDataPromise.mockResolvedValueOnce("OK")
  deleteObjectPromise.mockReturnValueOnce
  const importAction = jest.fn().mockReturnValueOnce({ succeeded: false })
  const result = transfer(
    logger,
    s3Client,
    cloudwatch,
    importAction,
    action,
    ingestConfig
  )
  await expect(result).rejects.toThrowError()
  expect(s3Client.getSignedUrlPromise).toHaveBeenCalled()
  expect(cloudwatch.putMetricData).toHaveBeenCalled()
  expect(s3Client.copyObject).toHaveBeenCalled()
  expect(s3Client.deleteObject).not.toHaveBeenCalled()
  expect(logger.getWarningsAndErrors()).toHaveLength(2)
  expect(logger.getLoggedLines().map((l) => l.message)).toContain(
    "Error whilst moving image to failed bucket"
  )
})
