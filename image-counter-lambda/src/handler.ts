import getCredentials from "./getCredentials";
import fetch from "node-fetch";
import CloudWatch from "aws-sdk/clients/cloudwatch";

interface MediaAPICredentials {
  baseUrl: string;
  "X-Gu-Media-Key": string;
}

const getImageCount = async (
  credentials: MediaAPICredentials
): Promise<number> => {
  const response = await fetch(credentials.baseUrl + "/images", {
    headers: {
      "X-Gu-Media-Key": credentials["X-Gu-Media-Key"]
    }
  });
  const images: { total: number } = await response.json();
  return images.total;
};

const metric = (value: number) => ({
  MetricData: [
    {
      MetricName: "ImageCount",
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

  // post it to CW as metric
  const client = new CloudWatch({ region: "eu-west-1" });

  await client.putMetricData(metric(images)).promise();

  // return happy lambda response to caller
  return { statusCode: 200, body: "Metric sent" };
};

const fns = { getCredentials, handler, getImageCount };

export default fns;
