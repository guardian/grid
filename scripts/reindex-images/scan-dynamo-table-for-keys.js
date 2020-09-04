const AWS = require("aws-sdk");
const fs = require("fs");

const outFile = process.argv[3];
const tableNamesString = process.argv[2];
const keysString = process.argv[4];
const title = `\nScript to scan 1 or more dynamo tables, listing the specified key.`
const info = `\nFormat -- node scan-dynamo-table-for-pk.js <table-names> <output-file> [<keys-for-each-table>] \n\nTable names should be separated by commas. \nKeys should be separated by commas, and correspond to the list of table names. Default is ’id’.\n`

if (process.argv.length < 3) {
  console.log(title, info)
  process.exit(0)
}

if (!tableNamesString || !outFile) {
  console.error(
    `\nIncorrect number of arguments. ${info}`
  );
  process.exit(1);
}

const tableNames = tableNamesString.split(",");
const keys = keysString ? keysString.split(",") : tableNames.map(_ => "id");

console.log(
  `Scanning tables ${tableNames.join(", ")} with keys ${keys.join(", ")}`
);

const credentials = new AWS.SharedIniFileCredentials({
  profile: "media-service"
});
AWS.config.update({
  region: "eu-west-1",
  credentials
});

const dynamo = new AWS.DynamoDB();
const handle = fs.createWriteStream(outFile);

const scan = async (tableName, key, lastKey) => {
  try {
    const params = { TableName: tableName, AttributesToGet: [key] };
    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }
    const data = await dynamo.scan(params).promise();

    // Transform keys
    let ids;
    try {
      ids = data.Items.map(_ => {
        if (!_[key]) {
          console.log(`Warning – no key ${key} found for record in ${JSON.stringify(_, null, '\t')}`)
          return undefined
        }
        return _[key].S 
      }).filter(_ => !!_);
      // Write keys
      await handle.write(`${ids.join("\n")}\n`);
      console.log(
        `Succesfully written ${ids.length} keys from table ${tableName} to ${outFile}`
      );
    } catch (e) {
      console.error(
        `Error accessing records with key ${key} -- is the key correct? Message: ${e.message}`
      );
    }

    // Check for next page and call again
    if (!data.LastEvaluatedKey) {
      console.log(`End of table ${tableName}`);
    } else {
      await scan(tableName, key, data.LastEvaluatedKey);
    }
  } catch (e) {
    console.error(`Error calling DynamoDB: ${e.message}`);
    process.exit(1);
  }
};

const promises = tableNames.map(
  async (tableName, i) => await scan(tableName, keys[i])
);

Promise.all(promises).then(() => {
  console.log("Scan complete.");
});
