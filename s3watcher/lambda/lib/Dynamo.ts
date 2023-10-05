/* eslint-disable no-console */
import { DynamoDB } from "aws-sdk"
import { Condition } from "aws-sdk/clients/dynamodb"

type UploadStatusTableRecord = DynamoDB.AttributeMap & {
  fileName?: { S: string }
  expires?: { N: string }
  uploadedBy?: { S: string }
  status: { S: "Queued" | "Pending" | "Completed" | "Failed" }
  uploadTime?: { S: string }
  id: { S: string }
}

const getRecordIdString = (record: UploadStatusTableRecord): string => {
  return record.id.S
}

// get the name of the Dynamo table starting with the prefix, throws errors is there is
// not exactly one match
export const getTableNameFromPrefix = async (
  ddb: DynamoDB,
  tableNamePrefix: string
): Promise<string> => {
  // Can only use ExclusiveStartTableName - if the prefix is the whole name,
  // listTables would return the name AFTER it
  const prefixWithoutLastCharacter = tableNamePrefix.substring(
    0,
    tableNamePrefix.length - 1
  )

  const data = await ddb
    .listTables({
      Limit: 56 + 10 + 1,
      ExclusiveStartTableName: prefixWithoutLastCharacter,
    })
    .promise()

  if (!data.TableNames) {
    throw new Error("no results")
  }

  const matches = data.TableNames.filter((name) =>
    name.startsWith(tableNamePrefix)
  )

  if (matches.length > 1) {
    throw new Error(`got ${matches.length} possible matches: ${matches.join()}`)
  }

  const [firstMatch] = matches

  if (!firstMatch) {
    throw new Error("no matches")
  }

  return firstMatch
}

export const scanTable = async (
  ddb: DynamoDB,
  tableName: string,
  limit?: number,
  scanFilter?: { [key: string]: Condition }
): Promise<DynamoDB.ItemList | undefined> => {
  const data = await ddb
    .scan({
      TableName: tableName,
      Limit: limit,
      ScanFilter: scanFilter,
    })
    .promise()

  return data.Items
}

/** construct a record object that can be put in dynamo table */
export const createQueuedUploadRecord = (
  id: string,
  fileName: string,
  expires: number
): UploadStatusTableRecord => {
  return {
    fileName: { S: fileName },
    expires: { N: expires.toString() },
    status: { S: "Queued" },
    id: { S: id },
  }
}

/** Put a record in the table, return the value of the id Attribute from the output.
 * returns a failure object if a record with the same ID already exists */
export const insertNewRecord = async (
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
  try {
    await ddb
      .putItem({
        TableName: tableName,
        Item: record,
        ReturnValues: "ALL_OLD",
        ReturnItemCollectionMetrics: "SIZE",
        ReturnConsumedCapacity: "",
        ConditionExpression: "attribute_not_exists(id)",
      })
      .promise()

    return { ok: true, id: getRecordIdString(record) }
  } catch (ddbErr) {
    if (ddbErr instanceof Error) {
      const castDbErr = ddbErr as Error & { code: string }
      if (castDbErr.code === "ConditionalCheckFailedException") {
        return {
          ok: false,
          id: getRecordIdString(record),
          error: castDbErr.code,
        }
      }
    }

    throw ddbErr
  }
}
