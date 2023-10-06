import { DynamoDB } from "aws-sdk"
import { Logger } from "../Logging"

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

const plusRegex = /"+"/g

// TO DO - verify that this is replicating the behaviour of CollectionsManager to generate an id from the path provided to
// CollectionsController.addChildToCollection
//   see common-lib/src/main/scala/com/gu/mediaservice/lib/collections/CollectionsManager.scala
//   def encode(uri: String): String = URLEncoder.encode(uri, "UTF-8").replace("+", "%20")
const pathToId = (path: string[]): string => {
  return encodeURI(path.join("/")).replace(plusRegex, "%20")
}

/** construct a record object that can be put in dynamo table */
export const createQueuedUploadRecord = (
  path: string[],
  fileName: string,
  expires: number
): UploadStatusTableRecord => {
  return {
    fileName: { S: fileName },
    expires: { N: expires.toString() },
    status: { S: "Queued" },
    id: { S: pathToId(path) },
  }
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
