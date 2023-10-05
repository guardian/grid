/* eslint-disable no-console */
import AWS from "aws-sdk"
import { readConfig } from "./lib/EnvironmentConfig"
import {
  UploadStatusTableRecord,
  createQueuedUploadRecord,
  getTableNameFromPrefix,
  insertNewRecord,
  scanTable,
} from "./lib/Dynamo"
import { exit } from "process"
import { createLogger } from "./lib/Logging"

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

const ddb = new AWS.DynamoDB({
  ...awsConfig,
  apiVersion: "2012-08-10",
  // running locally need to use localhost, not the proxy
  // error using  https://localstack.media.local.dev-gutools.co.uk was:
  // code: 'NetworkingError',
  // Error: unable to verify the first certificate
  endpoint: envConfig.isDev ? "http://localhost:4566" : undefined,
})

// Table name is not the same formatin localstack as in AWS
// Only accessing the test table for now (peace of mind - don't want to touch PROD while testing)
// TO DO - parameterise the prefix using envConfig.stage (PROD=PROD, CODE=TEST) or get the full name from config
const TABLE_PREFIX = envConfig.isDev
  ? "UploadStatusTable"
  : "media-service-TEST-UploadStatusDynamoTable"

const logAllRecords = async () => {
  logger.info(` >>> looking up table name beginning with "${TABLE_PREFIX}"...`)
  const tableName = await getTableNameFromPrefix(ddb, TABLE_PREFIX)
  logger.info(` >>> scanning table ${tableName}...`)
  const results = await scanTable(ddb, tableName, 10)
  logger.info(` >>> ${results?.length || 0} items in ${TABLE_PREFIX}:`)
  console.log(results)
}

//TO DO - put the logger in the transaction functions

const putInARecord = async (recordToPut: UploadStatusTableRecord) => {
  logger.info(` >>> looking up table name beginning with "${TABLE_PREFIX}"...`)
  const tableName = await getTableNameFromPrefix(ddb, TABLE_PREFIX)

  logger.info(` >>> putting a record in  "${tableName}"...`)
  const output = await insertNewRecord(ddb, tableName, recordToPut)

  if (output.ok) {
    logger.info(`successfully created record ${output.id}`)
  } else {
    logger.info(`failed to create record ${output.id}: ${output.error}`)
  }
}

const recordToPut = createQueuedUploadRecord(
  [
    "path",
    "to",
    "file",
    "image with encoded id.tiff?random-param=foobar&otherparam=1234567",
  ],
  "image with encoded id.tiff",
  new Date("2030-01-01").valueOf()
)

putInARecord(recordToPut)
  .then(logAllRecords)
  .catch((err) => {
    console.warn(err)
  })
  .finally(exit)
