const AWS = require("aws-sdk");
const fs = require("fs");
const exec = require("child_process").exec;

const tableName = process.argv[2];
const inFile = process.argv[3];

if (!tableName || !inFile) {
  console.error(
    `\nIncorrect number of arguments. Format -- node upload-ids-to-dynamo.js <table-name> <input-file>. The file should contain a list of image ids, separated by newlines.`
  );
  process.exit(1);
}

const credentials = new AWS.SharedIniFileCredentials({
  profile: "media-service"
});
AWS.config.update({
  region: "eu-west-1",
  credentials
});

const wc = filePath =>
  new Promise((res, rej) =>
    exec(`wc ${filePath}`, (error, results) =>
      error ? rej(error) : res(results)
    )
  );

const batchArray = (arr, n) =>
  arr.reduce((acc, line) => {
    if (!acc[acc.length - 1]) {
      acc.push([line]);
      return acc;
    }
    const isFull = acc[acc.length - 1].length > n - 1;
    if (isFull) {
      acc.push([line]);
      return acc;
    }
    acc[acc.length - 1].push(line);
    return acc;
  }, []);

const idsToDynParams = (tableName, ids) => ({
  RequestItems: {
    [tableName]: ids.map(id => ({
      PutRequest: {
        Item: {
          id: { S: id },
          progress_state: { N: "0" }
        }
      }
    }))
  }
});

const run = async () => {
  const lines = fs
    .readFileSync(inFile, { encoding: "UTF-8" })
    .split("\n")
    .filter(_ => !!_);
  const dynamo = new AWS.DynamoDB();
  const batchedIds = batchArray(lines, 25);
  const lineCount = await wc(inFile);

  console.log(`Uploading ${lineCount} to table ${tableName}`);

  for (const index in batchedIds) {
    const params = idsToDynParams(tableName, batchedIds[index]);
    try {
      await dynamo.batchWriteItem(params).promise();
      console.log(`Written batch ${parseInt(index) + 1} of ${batchedIds.length} to DynamoDB`);
    } catch (e) {
      console.log(`Error writing to dynamo: ${e.message}`);
    }
  }

  console.log("Upload complete");
};

run();
