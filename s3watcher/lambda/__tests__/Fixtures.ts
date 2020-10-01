import { S3 } from "aws-sdk"
import { ImportAction, IngestConfig } from "../lib/Lambda"
import { createLogger, Logger, LoggingFields } from "../lib/Logging"

export const ingestConfig: IngestConfig = {
  region: "eu-west-1",
  baseUrl: "https://grid.example.net",
  apiKey: "top-secret",
  failBucket: "grid-failure-bucket",
  s3UrlExpiry: 60,
  stage: "TEST",
}

export const action: ImportAction = {
  bucket: "import-bucket",
  filename: "image-to-import.jpg",
  key: "SupplierName/image-to-import.jpg",
  path: ["SupplierName", "image-to-import.jpg"],
  size: 12345678,
}

interface MockLogger extends Logger {
  getLoggedLines: () => LoggingFields[]
  getWarningsAndErrors: () => LoggingFields[]
}

export const createMockLogger = function (
  baseFields: LoggingFields
): MockLogger {
  const lines: LoggingFields[] = []
  const logger = createLogger(baseFields, (fields: LoggingFields) => {
    //console.log(`Logging ${JSON.stringify(fields)}`)
    lines.push(fields)
  })
  return {
    ...logger,
    getLoggedLines: () => lines,
    getWarningsAndErrors: () => {
      return lines.filter((l) => l.level !== "INFO")
    },
  }
}
