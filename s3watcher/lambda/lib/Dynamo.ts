import { DynamoDB } from "aws-sdk"
import { ImportAction, IngestConfig } from "./Lambda"
import { Condition } from "aws-sdk/clients/dynamodb"

type UploadRecord = {
  fileName?: { S: string }
  expires?: { N: number }
  uploadedBy?: { S: string }
  status: { S: "Queued" | "Pending" | "Completed" | "Failed" }
  uploadTime?: { S: number }
  id?: { S: string }
}

export const getTableNameFromPrefix = async (
  ddb: DynamoDB,
  tableNamePrefix: string
): Promise<string> => {
  const data = await ddb
    .listTables({
      Limit: 1,
      ExclusiveStartTableName: tableNamePrefix,
    })
    .promise()

  const firstName = data.LastEvaluatedTableName
  if (!firstName) {
    throw new Error("no results")
  }
  if (!firstName.startsWith(tableNamePrefix)) {
    throw new Error("no results matching prefix")
  }
  return firstName
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

export const createQueuedUploadRecord = (
  action: ImportAction,
  config: IngestConfig
): UploadRecord => {
  return {
    fileName: { S: action.filename },
    expires: { N: config.s3UrlExpiry }, // is this the right value for expires?
    // uploadedBy: { S: '??.??@guardian.co.uk' }, // s3 doesn't have meta data like the user details
    status: { S: "Queued" },
    // uploadTime: { S: now.toISOString() }, // not been uploaded yet
    // id: { S: '0749db6105a15515f5c23abfc2c4ade9c6816e7c' }
  }
}
