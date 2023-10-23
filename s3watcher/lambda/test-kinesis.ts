/* eslint-disable no-console */
import AWS, { Kinesis } from "aws-sdk"
import { exit } from "process"

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

const kinesis = new Kinesis({
  ...awsConfig,
  endpoint: envConfig.isDev ? "http://localhost:4566" : undefined,
})

const listAll = async () => {
  const streams = await kinesis.listStreams({

  }).promise()
  console.log(streams)
}

Promise.resolve()
  .then(listAll)
  .catch((err) => {
    console.warn(err)
  })
  .finally(exit)
