import AWS from "aws-sdk";

async function getCredentials() {
  const s3 = new AWS.S3();
  const params = {
    Bucket: "grid-conf",
    Key: `${process.env.STAGE}/subdomain-health-lambda/conf.json`
  };
  console.log("Getting credentials, params:", params);
  try {
    const data = await s3
      .getObject(params)
      .promise()
    const body = data.Body?.toString("utf8") || "";

    return JSON.parse(body);
  } catch (err) {
    console.error('getCredentials error', err)
    throw err
  }
}

export default getCredentials;
