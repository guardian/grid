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

const envConfig = readConfig()

const USE_LOCAL_STACK_ON_DEV = true as boolean

const configureAndCreateDynamoWithLocalStackOnDev = () => {
  const awsConfig = envConfig.isDev
    ? {
        accessKeyId: "test",
        secretAccessKey: "test",
        region: envConfig.region,
        // running locally need to use localhost, not the proxy
        // error using  https://localstack.media.local.dev-gutools.co.uk was:
        // code: 'NetworkingError',
        // Error: unable to verify the first certificate
        endpoint: "http://localhost:4566",
      }
    : undefined

  AWS.config.update({
    region: envConfig.region,
  })

  return new AWS.DynamoDB({
    ...awsConfig,
    apiVersion: "2012-08-10",
  })
}

const configureAndCreateDynamoUsingAwsOnDev = () => {
  if (envConfig.isDev) {
    const credentials = new AWS.SharedIniFileCredentials({
      profile: envConfig.profile,
    })
    AWS.config.credentials = credentials
  }

  AWS.config.update({
    region: envConfig.region,
  })

  return new AWS.DynamoDB({
    apiVersion: "2012-08-10",
  })
}

const ddb = USE_LOCAL_STACK_ON_DEV
  ? configureAndCreateDynamoWithLocalStackOnDev()
  : configureAndCreateDynamoUsingAwsOnDev()

// Table name is not the same formatin localstack as in AWS
// Only accessing the test table for now (peace of mind - don't want to touch PROD while testing)
// TO DO - parameterise the prefix using envConfig.stage (PROD=PROD, CODE=TEST) or get the full name from config
const TABLE_PREFIX =
  envConfig.isDev && USE_LOCAL_STACK_ON_DEV
    ? "UploadStatusTable"
    : "media-service-TEST-UploadStatusDynamoTable"

const logAllRecords = async () => {
  console.log(` >>> looking up table name beginning with "${TABLE_PREFIX}"...`)
  const tableName = await getTableNameFromPrefix(ddb, TABLE_PREFIX)
  console.log(` >>> scanning table ${tableName}...`)
  const results = await scanTable(ddb, tableName, 10)
  console.log(` >>> ${results?.length || 0} items in ${TABLE_PREFIX}:`)
  console.log(results)
}

const putInARecord = async (recordToPut: UploadStatusTableRecord) => {
  console.log(` >>> looking up table name beginning with "${TABLE_PREFIX}"...`)
  const tableName = await getTableNameFromPrefix(ddb, TABLE_PREFIX)

  console.log(` >>> putting a record in  "${tableName}"...`)
  const output = await insertNewRecord(ddb, tableName, recordToPut)

  if (output.ok) {
    console.log (`successfully created record ${output.id}`)
  } else {
    console.log (`failed to create record ${output.id}: ${output.error}`)
  }
}

const recordToPut = createQueuedUploadRecord(
  '1234',
  "picture to queue.tiff",
  new Date("2030-01-01").valueOf()
)

putInARecord(recordToPut)
  .then(logAllRecords)
  .catch((err) => {
    console.log(err)
  })
  .finally(exit)
