/* eslint-disable no-console */
import { DynamoDB } from "aws-sdk"
import { Condition } from "aws-sdk/clients/dynamodb"

type UploadStatusTableRecord = DynamoDB.AttributeMap & {
  fileName?: { S: string }
  expires?: { N: string }
  uploadedBy?: { S: string }
  status: { S: "Queued" | "Pending" | "Completed" | "Failed" }
  uploadTime?: { S: string }
  id?: { S: string }
}

const getRecordIdString = (
  record: DynamoDB.AttributeMap | undefined
): string | undefined => {
  if (!record) {
    return undefined
  }
  return record["id"]?.S
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
  fileName: string,
  expires: number
): UploadStatusTableRecord => {
  return {
    fileName: { S: fileName },
    expires: { N: expires.toString() },
    status: { S: "Queued" },
  }
}

/** Put a record in the table, return the value of the id Attribute from the output */
export const putRecord = async (
  ddb: DynamoDB,
  tableName: string,
  record: UploadStatusTableRecord
): Promise<string> => {
  const output = await ddb
    .putItem({
      TableName: tableName,
      Item: record,
      ReturnValues: "ALL_OLD",
    })
    .promise()

  const id = getRecordIdString(output.Attributes)
  if (!id) {
    console.log("putRecord", { output })
    throw new Error("output did not return an id")
  }

  return id
}
