import { AWSError, Kinesis } from "aws-sdk"
import { Logger } from "../Logging"
import { ImportAction } from "../Lambda"
import { Metadata } from "../MetaData"

export type UploadMessage = {
  uploadImageId: string
  filename: string
  url: string
  source: "ingest-bucket" | "import"
}

type PutMessageResult =
  | {
      ok: true
      sequenceNumber: string
      uploadImageId: string
    }
  | {
      ok: false
      error: string
      uploadImageId: string
    }

const buildS3Url = ({ bucket, filename, path }: ImportAction) =>
  `s3://${bucket}/${path.join("/")}/${filename}`

const buildMessage = (
  uploadImageId: string,
  action: ImportAction
): UploadMessage => ({
  uploadImageId: uploadImageId,
  filename: action.filename,
  url: buildS3Url(action),
  source: "ingest-bucket",
})

export const partitionKeys = ["partion-1", "partion-2", "partion-3"] as const

// TO DO - how many partitionKeys do we need ?
// can we make it configurable?
// in theory, the lambda could check the health/size of the queue to determine
// how to partion each message, but the extra calls would increase cost.
const determinePartionKey = (
  actionIndex: number,
  partitionOffset: number
): string => {
  const partitionKeyIndex =
    Math.floor(actionIndex + partitionOffset) % partitionKeys.length
  return partitionKeys[partitionKeyIndex]
}

export const putIngestFromBucketRecord = async (
  logger: Logger,
  kinesis: Kinesis,
  streamName: string,
  action: ImportAction,
  metadata: Metadata,
  /** the index of the action in the array mapped from rawEvent.Records */
  index: number,
  /** the index of partition key to start with - ie the on action with index 0 will use  */
  partitionOffset = 0
): Promise<PutMessageResult> => {
  const { uploadImageId } = metadata

  if (!uploadImageId) {
    throw new Error("No uploadImageId on metadata.")
  }

  const message = buildMessage(uploadImageId, action)

  logger.info("Adding message to UploadQueue", message)

  try {
    const result = await kinesis
      .putRecord({
        StreamName: streamName,
        PartitionKey: determinePartionKey(index, partitionOffset),
        Data: JSON.stringify(message),
      })
      .promise()

    return { ok: true, sequenceNumber: result.SequenceNumber, uploadImageId }
  } catch (kinesisErr) {
    if (kinesisErr instanceof AWSError) {
      // TO DO - only return a failure object if the code is an anticipated issue, otherwise throw?
      return {
        ok: false,
        error: kinesisErr.code,
        uploadImageId,
      }
    }

    logger.error("Error whilst adding new message", {
      error: JSON.stringify(kinesisErr),
    })
    throw kinesisErr
  }
}
