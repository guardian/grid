export const getTableNameFromPrefix = async (
  ddb: AWS.DynamoDB,
  tableNamePrefix: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    ddb.listTables(
      {
        Limit: 1,
        ExclusiveStartTableName: tableNamePrefix,
      },
      function (err, data) {
        if (err) {
          return reject(err)
        } else {
          const firstName = data.LastEvaluatedTableName
          if (!firstName) {
            return reject(new Error("no results"))
          }
          if (!firstName.startsWith(tableNamePrefix)) {
            return reject(new Error("no results matching prefix"))
          }
          if (firstName) {
            return resolve(firstName)
          }
        }
      }
    )
  })
}

