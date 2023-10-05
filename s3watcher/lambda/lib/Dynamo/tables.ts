import { DynamoDB } from "aws-sdk"
import { Condition } from "aws-sdk/clients/dynamodb"

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

