import { DynamoDB } from "aws-sdk"

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
): Promise<DynamoDB.ItemList | undefined> => {
  const data = await ddb
    .scan({
      TableName: tableName,
      Limit: limit,
    })
    .promise()

  return data.Items
}
