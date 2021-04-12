process.env.AWS_PROFILE = "media-service"
import { S3 } from "aws-sdk";
import { promises as fs } from "fs";
import path from "path";

let client = new S3({ region: "eu-west-1" });
const [, , Bucket, id] = process.argv;

const Key = `${id.substring(0, 6).split("").join("/")}/${id}`;

(async () => {
  console.log(`Attempting to backup and replace ${Bucket} object ${Key}`)
  await client
    .copyObject({
      Bucket,
      CopySource: `${Bucket}/${Key}`,
      Key: `${Key}_backup`,
    })
    .promise();
  console.log(`Backed up ${Key} to ${Key}_backup`);
  const { Metadata } = await client.headObject({ Bucket, Key }).promise();

  await client
    .upload({
      Bucket,
      Key: `${Key}`,
      Metadata,
      Body: await fs.readFile(path.resolve("./" + id)),
    })
    .promise();
  console.log(`Uploaded ${id} to ${Key}`);
})();
