import { S3EventRecord } from "aws-lambda"
import {
  createActionFromNotification,
  ImportAction,
  IngestConfig,
  parseIngestConfig,
} from "../lib/Lambda"

test("createActionFromNotification correctly parses a record", () => {
  const record: S3EventRecord = {
    awsRegion: "eu-west-1",
    eventName: "Put",
    eventVersion: "",
    eventSource: "S3",
    eventTime: "",
    userIdentity: {
      principalId: "",
    },
    requestParameters: {
      sourceIPAddress: "",
    },
    responseElements: {
      "x-amz-id-2": "",
      "x-amz-request-id": "",
    },
    s3: {
      s3SchemaVersion: "",
      configurationId: "",
      bucket: {
        name: "import-bucket",
        ownerIdentity: {
          principalId: "",
        },
        arn: "",
      },
      object: {
        key: "SupplierEight/image-to-import.jpg",
        size: 12345678,
        eTag: "tag",
        sequencer: "???",
      },
    },
  }

  const result = createActionFromNotification(record)

  const expected: ImportAction = {
    bucket: "import-bucket",
    filename: "image-to-import.jpg",
    key: "SupplierEight/image-to-import.jpg",
    path: ["SupplierEight", "image-to-import.jpg"],
    size: 12345678,
  }

  expect(result).toEqual(expected)
})

test("parseIngestConfig should parse a JSON config", () => {
  const config = `{
    "stage": "CONFIG_TEST",
    "baseUrl": "https://test.grid.example.net/",
    "apiKey": "1234567890qwertyuiopasdfghjklzxcvbnm",
    "failBucket": "uh-oh-bucket",
    "s3UrlExpiry": 60,
    "region": "test-west-1"
  }`
  const action: Promise<IngestConfig> = parseIngestConfig(config)
  expect(action).resolves.toEqual({
    region: "test-west-1",
    baseUrl: "https://test.grid.example.net/",
    apiKey: "1234567890qwertyuiopasdfghjklzxcvbnm",
    failBucket: "uh-oh-bucket",
    s3UrlExpiry: 60,
    stage: "CONFIG_TEST",
  })
})

test("parseIngestConfig should fail to parse an incomplete config", () => {
  const config = `{
    "stage": "CONFIG_TEST"
  }`
  const action: Promise<IngestConfig> = parseIngestConfig(config)
  expect(action).rejects.toThrowError("Provided JSON is not a valid configuration")
})

test("parseIngestConfig should fail to parse an incomplete config", () => {
  const config = ""
  const action: Promise<IngestConfig> = parseIngestConfig(config)
  expect(action).rejects.toThrowError("Provided string is invalid JSON")
})
