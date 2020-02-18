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

  return await response.json();
};

const metric = (key: string, value: number) => ({
  MetricData: [
    {
      MetricName: `${key}-Response`,
      Unit: "StatusCode",
      Value: value
    }
  ],
  Namespace: `${process.env.STAGE}/Subdomains`
});

const getResponse = async (
  domain: string
): Promise<{
  domain: string;
  response: number;
}> => {
  const result = await fetch(domain);
  return {
    domain,
    response: result.status
  };
};

export const handler = async (): Promise<{
  statusCode: number;
  body: string;
}> => {
  console.log("Starting up!");
  // TODO: Make it so the credentials return objects of the {name: string, domain: string} type
  // so that we can pass it as a metric name.
  // Currently, metric name is just the domain
  const credentials: { subdomains: string[] } = await getCredentials();
  const { subdomains } = credentials;
  console.log("subdomains", subdomains);

  const client = new CloudWatch({ region: "eu-west-1" });

  await Promise.all(
    subdomains
      .map(async domain => await getResponse(domain))
      .map(async response => {
        const d = await response;
        const met = metric(d.domain, d.response);
        console.log("logging metric:", met);
        await client.putMetricData(met).promise();
      })
  );

  // return happy lambda response to caller
  return {
    statusCode: 200,
    body: `Metrics sent for metrics: ${JSON.stringify(subdomains)}`
  };
};

const fns = { getCredentials, handler, getImageCount };

export default fns;

(async function() {
  try {
    await handler();
  } catch (err) {
    console.error(err);
  }
})();
