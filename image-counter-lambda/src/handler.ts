import getCredentials from "./getCredentials";
import fetch from "node-fetch";
import {
  CloudWatchClient,
  PutMetricDataCommand
} from "@aws-sdk/client-cloudwatch";

interface MediaAPICredentials {
  baseUrl: string;
  "X-Gu-Media-Key": string;
}

interface ImageCounts {
  catCount: number;
  searchResponseCount: number;
  indexStatsCount: number;
}


const client = new CloudWatchClient({ region: "eu-west-1" });

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
      Unit: "Count" as const,
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
  const imageMetrics = [...Object.entries(images)].map((k,v)=>metric(k.toUpperCase(), value as number))
  await client.send(new PutMetricDataCommand(imageMetrics));

  // return happy lambda response to caller
  return {
    statusCode: 200,
    body: `Metrics sent for metrics: ${JSON.stringify(images)}`
  };
};

const fns = { getCredentials, handler, getImageCount };

export default fns;
