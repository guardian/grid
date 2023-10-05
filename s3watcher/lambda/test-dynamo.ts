/* eslint-disable no-console */
import AWS from "aws-sdk"
import { readConfig } from "./lib/EnvironmentConfig"
import { getTableNameFromPrefix, scanTable } from "./lib/Dynamo"
import { exit } from "process"

const envConfig = readConfig()

// config problem? getting error trying to reach dynamo from local stack:
// code: 'NetworkingError',
// Error: unable to verify the first certificate
const USE_LOCAL_STACK_ON_DEV = true as boolean

const configureAndCreateDynamoWithLocalStackOnDev = () => {
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

// access the test table for now -  could parameterise and/or use config to set this
const TEST_TABLE_PREFIX = "media-service-TEST-UploadStatusDynamoTable"

const logResults = async () => {
  try {

    console.log(' >>> looking up table name...')
    const tableName = await getTableNameFromPrefix(ddb, TEST_TABLE_PREFIX)
    console.log(` >>> scanning table ${tableName}...`)
    const results = await scanTable(ddb, tableName, 10)
    console.log(` >>> ${results?.length || 0} items in ${TEST_TABLE_PREFIX}:`)
    console.log(results)
  } catch(err) {
    console.log(' >>> FAILED')
    console.log(err)
  }
}

logResults().finally(exit)
