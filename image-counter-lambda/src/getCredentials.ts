import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

async function getCredentials() {
  const s3 = new S3Client({});
  const params = {
    Bucket: "grid-conf",
    Key: `${process.env.STAGE}/image-counter-lambda/conf.json`
  };

  const data = await s3.send(new GetObjectCommand(params));
  const body = (await data.Body?.transformToString("utf8")) || "";

  return JSON.parse(body);
}

export default getCredentials;
