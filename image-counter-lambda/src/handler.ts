import getCredentials from "./getCredentials";
import fetch from "node-fetch";
import CloudWatch from "aws-sdk/clients/cloudwatch";

interface MediaAPICredentials {
  baseUrl: string;
  "X-Gu-Media-Key": string;
}

interface ImageCounts {
  catCount: number;
  searchResponseCount: number;
  indexStatsCount: number;
}

const getImageCount = async (
  credentials: MediaAPICredentials
): Promise<ImageCounts> => {
  const endpoint = credentials.baseUrl + "/management/imageCounts";
  const params = {
    headers: { "X-Gu-Media-Key": credentials["X-Gu-Media-Key"] }
  };
  const response = await fetch(endpoint, params);

  return await response.json() as ImageCounts;
};

const metric = (key: string, value: number) => ({
  MetricData: [
    {
      MetricName: "ImageCount-" + key,
      Unit: "Count",
      Value: value
    }
  ],
  Namespace: `${process.env.STAGE}/MediaApi`
});

export const handler = async (): Promise<{
  statusCode: number;
  body: string;
}> => {
  // get credentials
  const credentials = await getCredentials();

  // query media api with credentials
  const images = await getImageCount(credentials);
  console.log("image counts", images);

  // post it to CW as metric
  const client = new CloudWatch({ region: "eu-west-1" });

  for (const key of Object.keys(images)) {
    const met = metric(key.toUpperCase(), images[key]);
    await client.putMetricData(met).promise();
  }

  // return happy lambda response to caller
  return {
    statusCode: 200,
    body: `Metrics sent for metrics: ${JSON.stringify(images)}`
  };
};

const fns = { getCredentials, handler, getImageCount };

export default fns;
