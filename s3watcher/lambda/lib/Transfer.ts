import { createMetric } from "./Metrics"
import {
  buildGridImportRequest,
  GridImportRequest,
  UploadResult,
} from "./GridApi"
import { ImportAction, IngestConfig } from "./Lambda"
import { S3, CloudWatch } from "aws-sdk"
import { Logger } from "./Logging"

const COPY_TO_LOWER_ENV_PROBABILITY = 0.01

type ImportCall = (
  logger: Logger,
  req: GridImportRequest
) => Promise<UploadResult>

export const transfer = async function (
  logger: Logger,
  s3: S3,
  cloudwatch: CloudWatch,
  importImage: ImportCall,
  event: ImportAction,
  config: IngestConfig
): Promise<UploadResult> {
  const s3ObjectRequest = {
    Bucket: event.bucket,
    Key: event.key,
  }

  logger.info("Importing via image-loader.", s3ObjectRequest)

  const urlExpiryInSeconds = config.s3UrlExpiry
  const signedUrl = await s3.getSignedUrlPromise("getObject", {
    ...s3ObjectRequest,
    Expires: urlExpiryInSeconds,
  })

  const importRequest = await buildGridImportRequest(config, event, signedUrl)
  const uploadResult = await importImage(logger, importRequest)
  logger.info("Grid API call finished", {
    event: JSON.stringify(uploadResult),
  })

  // record the cloudwatch result either way
  await cloudwatch
    .putMetricData(createMetric(uploadResult, new Date()))
    .promise()
    .catch((err) => {
      logger.error("Error whilst recording cloudwatch metrics", {
        error: JSON.stringify(err),
      })
    })

  if (uploadResult.succeeded) {

    // ALSO copy a percentage sample of images to lower environment
    const lowerEnvironmentIngestBucket = process.env.LOWER_ENVIRONMENT_INGEST_BUCKET
    const isProd = config.stage.toLowerCase() === "prod"
    if(isProd && lowerEnvironmentIngestBucket && lowerEnvironmentIngestBucket !== event.bucket && Math.random() < COPY_TO_LOWER_ENV_PROBABILITY){
      const loggingFields = { filename: event.filename }
      logger.info(`Also copying image to lower environment's ingest bucket (based on ${COPY_TO_LOWER_ENV_PROBABILITY} probability/sampling)...`, loggingFields)
      await s3.copyObject({
        CopySource: `/${s3ObjectRequest.Bucket}/${s3ObjectRequest.Key}`,
        Bucket: lowerEnvironmentIngestBucket,
        Key: s3ObjectRequest.Key,
      }).promise()
        .then(() => {
          logger.info("Successfully copied image to lower environment's ingest bucket.", loggingFields)
        })
        .catch((err) => {
          logger.error(`Error whilst copying ingested image to lower environment: ${err}`, loggingFields)
        })
    }

    logger.info(
      `Deleting from ingest bucket ${JSON.stringify(s3ObjectRequest)}`
    )
    await s3
      .deleteObject(s3ObjectRequest)
      .promise()
      .catch((err) => {
        logger.error("Error whilst deleting ingested image", err)
      })
  } else {
    const s3CopyToDeadLetterReq = {
      CopySource: event.bucket + "/" + event.key,
      Bucket: config.failBucket,
      Key: event.key,
    }

    try {
      logger.warn(
        `Import failed, copying to failure bucket ${JSON.stringify(
          s3CopyToDeadLetterReq
        )}`
      )
      await s3.copyObject(s3CopyToDeadLetterReq).promise()
      logger.info(
        `Deleting from ingest bucket ${JSON.stringify(s3ObjectRequest)}`
      )
      await s3
        .deleteObject(s3ObjectRequest)
        .promise()
        .catch((err) => {
          logger.error("Error whilst deleting failed ingested image", {
            error: JSON.stringify(err),
          })
        })
    } catch (err) {
      logger.error("Error whilst moving image to failed bucket", {
        error: JSON.stringify(err),
      })
    }

    throw new Error(`Unable to import file: s3://${event.bucket}/${event.key}`)
  }
  return uploadResult
}
