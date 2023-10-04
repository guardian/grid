/* eslint-disable no-console */
import AWS from "aws-sdk"
import { readConfig } from "./lib/EnvironmentConfig"
import { getTableNameFromPrefix } from "./lib/Dynamo"

const envConfig = readConfig()

// config problem? getting error trying to reach dynamo from local stack:
// code: 'NetworkingError',
// Error: unable to verify the first certificate
const USE_LOCAL_STACK_ON_DEV = false as boolean

const configureAndCreateDynamo = () => {
  if (!USE_LOCAL_STACK_ON_DEV || !envConfig.isDev) {
    const credentials = new AWS.SharedIniFileCredentials({
      profile: "media-service",
    })
    AWS.config.credentials = credentials
  }

  const awsConfig =
    USE_LOCAL_STACK_ON_DEV && envConfig.isDev
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

const ddb = configureAndCreateDynamo()

// access the test table for now -  could parameterise and/or use config to set this
const TEST_TABLE_PREFIX = "media-service-TEST-UploadStatusDynamoTable"

getTableNameFromPrefix(ddb, TEST_TABLE_PREFIX).then((r) => {
  console.log("result", r)
})
