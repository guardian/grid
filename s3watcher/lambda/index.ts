import {
  createActionFromNotification,
  ImportAction,
  IngestConfig,
  readIngestConfig,
  parseIngestConfig,
} from "./lib/Lambda"
import { transfer } from "./lib/Transfer"
import AWS from "aws-sdk"
import { readConfig } from "./lib/EnvironmentConfig"

import { Handler, S3Event } from "aws-lambda"
import { createLogger } from "./lib/Logging"
import { importImage } from "./lib/GridApi"

const envConfig = readConfig()
const logger = createLogger({})

const credentials = envConfig.isDev
  ? new AWS.SharedIniFileCredentials({ profile: envConfig.profile })
  : undefined

AWS.config.update({
  credentials: credentials,
  region: envConfig.region,
})

const s3 = new AWS.S3()
const cloudwatch = new AWS.CloudWatch()

interface Failure {
  error: any // eslint-disable-line @typescript-eslint/no-explicit-any
  event: ImportAction
}
function isFailure(item: Failure | void): item is Failure {
  return item !== undefined
}

const processEvent = async function (action: ImportAction): Promise<void> {
  const ingestConfigString: string = await readIngestConfig(s3, action)
  const ingestConfig: IngestConfig = await parseIngestConfig(ingestConfigString)
  await transfer(logger, s3, cloudwatch, importImage, action, ingestConfig)
  logger.info("Completed processing import action")
}

export const handler: Handler = async (rawEvent: S3Event): Promise<void> => {
  logger.info("Received notification from S3")

  const events: ImportAction[] = rawEvent.Records.map(
    createActionFromNotification
  )

  const results = await Promise.all(
    events.map((e) =>
      processEvent(e).catch((error) => {
        return <Failure>{ error, event: e }
      })
    )
  )

  const failures = results.filter(isFailure)

  failures.forEach((failure) => {
    logger.error("Failed to process event", {
      event: JSON.stringify(failure.event),
      failure: JSON.stringify(failure.error),
    })
  })

  logger.info(
    `Processed ${events.length - failures.length}/${
      events.length
    } events successfully`
  )
}
