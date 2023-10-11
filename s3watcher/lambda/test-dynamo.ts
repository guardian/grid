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

// TO DO - verify if the asset filename and the file-name meta value are the same.
// file-name meta value may not be present as uploadRequest.uploadInfo.filename is
// Option[String]
// TO DO - will we need to parse the "identifier" meta data properties?
// Think these are only relevant for elastic search, but not sure
// there will be a set of (arbitrary?) keys prefixed with with the
// ImageStorageProps.identifierMetadataKeyPrefix ("identifier!")
// see :
// - image-loader/app/model/upload/UploadRequest.scala
// - image-loader/app/model/Uploader.scala : toMetaMap method
const testRecord = createQueuedUploadRecord(
  {
    fileName: "image with real id.tiff",
    uploadImageId: "0d47e46edd20b70699429b0c9bff89b1082ba36b",
    uploadTime: '1970-01-01T15:48:52.628+01:00',
    uploadedBy: 'test-program@example.com',
  },
  "image with real id.tiff",
  new Date("2030-01-01").valueOf()
)

/** Test operation - log the records in the upload table */
const logAllRecords = async () => {
  const tableName = await getUploadStatusTableName(logger, dynamoDB, envConfig)
  const results = await scanTable(logger, dynamoDB, tableName, 10)
  console.log(
    {
      tableName,
      count: results?.length,
    },
    results
  )
}

/** Test operation - add a record to the upload table */
const putInARecord = async (recordToPut: UploadStatusTableRecord) => {
  const tableName = await getUploadStatusTableName(logger, dynamoDB, envConfig)
  await insertNewRecord(logger, dynamoDB, tableName, recordToPut)
}

putInARecord(testRecord)
  .then(logAllRecords)
  .catch((err) => {
    console.warn(err)
  })
  .finally(exit)
