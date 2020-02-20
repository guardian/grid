import AWS from "aws-sdk";

export interface SubdomainConfig {
  subdomains: Domain[];
}

export interface Domain {
  name: string;
  endpoint: string;
}

async function getConfigFromS3(): Promise<SubdomainConfig> {
  const s3 = new AWS.S3();
  const params = {
    Bucket: "grid-conf",
    Key: `${process.env.STAGE}/subdomain-health-lambda/conf.json`
  };
  console.log("Getting subdomains, params:", params);
  try {
    const data = await s3.getObject(params).promise();
    const body = data.Body?.toString("utf8") || "";

    return JSON.parse(body);
  } catch (err) {
    console.error("getDomains error", err);
    throw err;
  }
}

export default getConfigFromS3;
