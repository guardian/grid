import { DynamoDB } from "aws-sdk"
import { Logger } from "../Logging"
import type { Metadata } from "../MetaData"

export type UploadStatusTableRecord = DynamoDB.AttributeMap & {
  id: { S: string }
  status: { S: "Queued" | "Pending" | "Completed" | "Failed" }
  fileName?: { S: string }
  expires?: { N: string }
  uploadedBy?: { S: string }
  uploadTime?: { S: string }
}

const getRecordIdString = (record: UploadStatusTableRecord): string => {
  return record.id.S
}

/** construct a record object that can be put in dynamo table
 *
 * TO DO - verify if the asset filename and the file-name meta value are the same.
 * file-name meta value may not be present as uploadRequest.uploadInfo.filename is
 * Option[String]
 */
export const createQueuedUploadRecord = (
  metadata: Metadata,
  fileName: string,
  expires: number
): UploadStatusTableRecord => {
  const { uploadImageId, uploadTime, uploadedBy } = metadata
  if (!uploadImageId) {
    throw new Error('No "upload-image-id" metadata value')
  }

  const record: UploadStatusTableRecord = {
    fileName: { S: fileName },
    expires: { N: expires.toString() },
    status: { S: "Queued" },
    id: { S: uploadImageId },
  }

  if (uploadTime) {
    record.uploadTime = { S: uploadTime }
  }
  if (uploadedBy) {
    record.uploadedBy = { S: uploadedBy }
  }

  return record
}

/** Put a record in the table, return the value of the id Attribute from the output.
 * returns a failure object if a record with the same ID already exists */
export const insertNewRecord = async (
  logger: Logger,
  ddb: DynamoDB,
  tableName: string,
  record: UploadStatusTableRecord
): Promise<
  | {
      ok: true
      id: string
    }
  | {
      ok: false
      id: string
      error: string
    }
> => {
  logger.info("Inserting new record to UploadStatusTable", {
    filename: record.fileName?.S ?? "",
    expires: record.expires?.N ?? "",
    status: record.status?.S ?? "",
    id: record.id?.S ?? "",
  })

  try {
    const putItemOutput = await ddb
      .putItem({
        TableName: tableName,
        Item: record,
        ReturnValues: "ALL_OLD",
        ReturnItemCollectionMetrics: "SIZE",
        ReturnConsumedCapacity: "",
        ConditionExpression: "attribute_not_exists(id)",
      })
      .promise()

    logger.info("Insert new record finished", {
      event: JSON.stringify({ event: JSON.stringify(putItemOutput) }),
    })
    return { ok: true, id: getRecordIdString(record) }
  } catch (ddbErr) {
    if (ddbErr instanceof Error) {
      const castDbErr = ddbErr as Error & { code: string }
      if (castDbErr.code === "ConditionalCheckFailedException") {
        logger.warn(
          `Insert new record failed - id already exists: ${getRecordIdString(
            record
          )}`
        )
        return {
          ok: false,
          id: getRecordIdString(record),
          error: castDbErr.code,
        }
      }
    }

    logger.error("Error whilst insert new record", {
      error: JSON.stringify(ddbErr),
    })
    throw ddbErr
  }
}
