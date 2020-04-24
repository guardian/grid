const AWS = require("aws-sdk");
const fs = require("fs");

const outFile = process.argv[3];
const tableName = process.argv[2];
const title = `\nScript to scan a batch-index table, writing the results to a file.`;
const info = `\nFormat -- node scan-dynamo-table-for-pk.js <table-name> <output-file>`;

if (process.argv.length < 3) {
  console.log(title, info)
  process.exit(0)
}

if (!tableName || !outFile) {
  console.error(
    `\nIncorrect number of arguments. ${info}`
  );
  process.exit(1);
}

console.log(
  `Scanning table ${tableName}`
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

const scan = async lastKey => {
  try {
    const params = { TableName: tableName, AttributesToGet: ['id', 'progress_state'] };
    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }
    const data = await dynamo.scan(params).promise();

    // Transform keys
    try {
      const rows = data.Items.map(_ => {
        if (!_.id) {
          console.log(`Warning – no id found for record in ${JSON.stringify(_, null, '\t')}`)
          return undefined
        }
        return `${_.id.S} ${_.progress_state.N}`;
      }).filter(_ => !!_);
      // Write keys
      await handle.write(`${rows.join("\n")}\n`);
      console.log(
        `Succesfully written ${rows.length} keys from table ${tableName} to ${outFile}`
      );
    } catch (e) {
      console.error(
        `Error accessing records with property 'id' -- does the table have this property? Message: ${e.message}`
      );
    }

    // Check for next page and call again
    if (!data.LastEvaluatedKey) {
      console.log(`End of table ${tableName}`);
    } else {
      await scan(data.LastEvaluatedKey);
    }
  } catch (e) {
    console.error(`Error calling DynamoDB: ${e.message}`);
    process.exit(1);
  }
};

scan().then(() => {
  console.log("Scan complete.");
});
