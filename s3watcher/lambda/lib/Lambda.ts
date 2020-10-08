import { S3EventRecord } from "aws-lambda"
import { S3 } from "aws-sdk"

export interface ImportAction {
  bucket: string
  path: string[]
  key: string
  filename: string
  size: number
}

export interface IngestConfig {
  region: string
  baseUrl: string
  apiKey: string
  failBucket: string
  s3UrlExpiry: number
  stage: string
}

export const createActionFromNotification = function (
  record: S3EventRecord
): ImportAction {
  const e = record.s3

  const normaliseKey = function (key: string) {
    return decodeURIComponent(key.replace(/\+/g, " "))
  }
  const key = normaliseKey(e.object.key)
  const bucket = e.bucket.name
  const size = e.object.size

  const path = key.split("/")
  const filename = path[path.length - 1]

  return {
    bucket,
    path,
    key,
    filename,
    size,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isIngestConfig = function (config: any): config is IngestConfig {
  return (
    typeof config === "object" &&
    typeof config.region === "string" &&
    typeof config.baseUrl === "string" &&
    typeof config.apiKey === "string" &&
    typeof config.failBucket === "string" &&
    typeof config.stage === "string" &&
    typeof config.s3UrlExpiry === "number"
  )
}

export const parseIngestConfig = async function (
  json: string
): Promise<IngestConfig> {
  try {
    const parsedJson = JSON.parse(json)
    if (isIngestConfig(parsedJson)) {
      return parsedJson
    }
    return Promise.reject(
      new Error("Provided JSON is not a valid configuration")
    )
  } catch (e) {
    return Promise.reject(new Error("Provided string is invalid JSON"))
  }
}

export const readIngestConfig = async function (
  s3Client: S3,
  event: ImportAction
): Promise<string> {
  const response = await s3Client
    .getObject({
      Bucket: event.bucket,
      Key: "config.json",
    })
    .promise()
  const data = response.Body?.toString()
  if (data === undefined) {
    return Promise.reject(
      new Error(`Error reading config from s3://${event.bucket}/config.json`)
    )
  } else {
    return data
  }
}
