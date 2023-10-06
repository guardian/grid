import { DynamoDB } from "aws-sdk"
import { Condition } from "aws-sdk/clients/dynamodb"
import { EnvironmentConfig } from "../EnvironmentConfig"

// get the name of the Dynamo table starting with the prefix, throws errors is there is
// not exactly one match
const getTableNameFromPrefix = async (
  dynamoDB: DynamoDB,
  tableNamePrefix: string
): Promise<string> => {
  // Can only use ExclusiveStartTableName - if the prefix is the whole name,
  // listTables would return the name AFTER it
  const prefixWithoutLastCharacter = tableNamePrefix.substring(
    0,
    tableNamePrefix.length - 1
  )

  const data = await dynamoDB
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
  dynamoDB: DynamoDB,
  tableName: string,
  limit?: number,
  scanFilter?: { [key: string]: Condition }
): Promise<DynamoDB.ItemList | undefined> => {
  const data = await dynamoDB
    .scan({
      TableName: tableName,
      Limit: limit,
      ScanFilter: scanFilter,
    })
    .promise()

  return data.Items
}

export const getUploadStatusTableName = async (
  dynamoDB: DynamoDB,
  envConfig: EnvironmentConfig
): Promise<string> => {
  // Table name is fixed in localstack
  if (envConfig.isDev) {
    return Promise.resolve("UploadStatusTable")
  }

  // quirk : asset names for the CODE stage use "TEST"
  const stageOrTest = envConfig.stage === "CODE" ? "TEST" : envConfig.stack
  const prefix = `${envConfig.stack}-${stageOrTest}-UploadStatusDynamoTable`

  // Might not be necessary - get we get the full name of the table from config?
  return getTableNameFromPrefix(dynamoDB, prefix)
}
