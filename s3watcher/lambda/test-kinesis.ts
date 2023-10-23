/* eslint-disable no-console */
import AWS from "aws-sdk"
import { exit } from "process"

import { readConfig } from "./lib/EnvironmentConfig"
import { createLogger } from "./lib/Logging"
import { DEV_UPLOAD_QUEUE_STREAM_NAME, listAllStreams, listShards, makeKinesisInstance } from "./lib/Kinesis"

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

const kinesis = makeKinesisInstance(envConfig.isDev, awsConfig)

const listAll = async () => {
  const result = await listAllStreams(logger, kinesis)
  console.log("StreamNames", result.StreamNames)
}

const listShardsInDevQueue =async () => {
  const result = await listShards(logger, kinesis,DEV_UPLOAD_QUEUE_STREAM_NAME)
  console.log("Shards", result.Shards)
}

Promise.resolve()
  .then(listAll)
  .then(listShardsInDevQueue)
  .catch((err) => {
    console.warn(err)
  })
  .finally(exit)
