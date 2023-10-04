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

const awsConfig = envConfig.isDev
  ? {
    accessKeyId: 'test',
    secretAccessKey: 'test',
    region: envConfig.region,
    endpoint: "https://localstack.media.local.dev-gutools.co.uk",
    s3ForcePathStyle: true
  }
  : undefined

AWS.config.update({
  region: envConfig.region,
})

const s3 = new AWS.S3(awsConfig)
const cloudwatch = new AWS.CloudWatch(awsConfig)

// will need a dynamo instance to access UploadStatusTable
// const dynamoDB = new AWS.DynamoDB(awsConfig)

// will need kinesis or sqs interface for the uploadQueue
// const uploadQueue - new AWS.SQS(awsConfig)
// const uploadQueue - new AWS.Kinesis(awsConfig)


interface Failure {
  error: any // eslint-disable-line @typescript-eslint/no-explicit-any
  event: ImportAction
}
function isFailure(item: Failure | void): item is Failure {
  return item !== undefined
}

const processEvent = async function(action: ImportAction): Promise<void> {
  const ingestConfigString: string = await readIngestConfig(s3, action)
  const ingestConfig: IngestConfig = await parseIngestConfig(ingestConfigString)
  // TO DO - instead of transferring to the image using the fetchUrl derived from the action,
  // need to place a message on the ingest queue for the image with s3 url for the image
  await transfer(logger, s3, cloudwatch, importImage, action, ingestConfig)
  // await addToQueue(logger, s3, uploadQueue, action, ingestConfig)

  // For successful messages, also need to write a record with "queued" status to DynamoDB table
  // wouldn't need any conditions to test if updateUpLoadStatusDynamoDB passed before running updateUpLoadStatusDynamoDB
  // if the addToQueue function throws errors on failure
  // await updateUpLoadStatusDynamoDB(logger, s3, dynamoDB, action, ingestConfig)

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
    `Processed ${events.length - failures.length}/${events.length
    } events successfully`
  )
}
