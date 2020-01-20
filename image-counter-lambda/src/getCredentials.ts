import AWS from "aws-sdk";

async function getCredentials() {
  const s3 = new AWS.S3();
  const params = {
    Bucket: "grid-conf",
    Key: `${process.env.STAGE}/image-counter-lambda/conf.json`
  };

  const data = await s3.getObject(params).promise();
  const buffer = data.Body;
  const body = buffer ? buffer.toString("utf8") : "";

  return JSON.parse(body);
}

export default getCredentials;
