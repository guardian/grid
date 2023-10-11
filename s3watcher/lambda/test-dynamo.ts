/* eslint-disable no-console */
import AWS from "aws-sdk"
import { exit } from "process"
import {
  UploadStatusTableRecord,
  createQueuedUploadRecord,
  getUploadStatusTableName,
  insertNewRecord,
  scanTable,
  makeDDBInstance,
} from "./lib/Dynamo"
import { readConfig } from "./lib/EnvironmentConfig"
import { createLogger } from "./lib/Logging"

// copy of the config code from ./index [start]
const envConfig = readConfig()
const logger = createLogger({})

const awsConfig = envConfig.isDev
  ? {
      accessKeyId: "test",
      secretAccessKey: "test",
      region: envConfig.region,
      endpoint: "https://localstack.media.local.dev-gutools.co.uk",
      s3ForcePathStyle: true,
    }
  : undefined

AWS.config.update({
  region: envConfig.region,
})
// copy of the config code from ./index [end]

const dynamoDB = makeDDBInstance(envConfig.isDev, awsConfig)

const recordWithExistingId = createQueuedUploadRecord(
  {
    fileName: "image with real id.tiff",
    uploadImageId: "0d47e46edd20b70699429b0c9bff89b1082ba36b",
    uploadTime: "1970-01-01T15:48:52.628+01:00",
    uploadedBy: "test-program@example.com",
  },
  "image with real id.tiff",
  new Date("2030-01-01").valueOf()
)
const recordWithRandomId = createQueuedUploadRecord(
  {
    fileName: "image with random id.jpg",
    uploadImageId: `random-ID-${Math.random()
      .toString()
      .substring(3)}-${Math.random().toString().substring(3)}`,
    uploadTime: "1970-01-01T15:48:52.628+01:00",
    uploadedBy: "test-program@example.com",
  },
  "image with random id.jpg",
  new Date("2030-01-01").valueOf()
)

/** Test operation - log the records in the upload table */
const logAllRecords = async () => {
  const tableName = await getUploadStatusTableName(logger, dynamoDB, envConfig)
  const results = await scanTable(logger, dynamoDB, tableName, 10)
  console.log({
    tableName,
    count: results?.length,
  })
  console.table(results)
}

/** Test operation - add a record to the upload table */
const putInARecord = (record: UploadStatusTableRecord) => async () => {
  const tableName = await getUploadStatusTableName(logger, dynamoDB, envConfig)
  const output = await insertNewRecord(logger, dynamoDB, tableName, record)
  if (output.ok) {
    console.log(`\t>>>\tInsert of ${record.fileName?.S} succeeded!`)
  } else {
    console.log(
      `\t>>>\tInsert of ${record.fileName?.S} failed!: ${output.error}`
    )
  }
}

Promise.resolve()
  .then(putInARecord(recordWithExistingId))
  .then(putInARecord(recordWithRandomId))
  .then(logAllRecords)
  .catch((err) => {
    console.warn(err)
  })
  .finally(exit)
