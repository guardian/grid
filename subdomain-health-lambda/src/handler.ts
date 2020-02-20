import getConfigFromS3, { Domain } from "./getConfigFromS3";
import fetch from "node-fetch";
import CloudWatch, { MetricData } from "aws-sdk/clients/cloudwatch";

const metric = (
  domain: Domain,
  value: number
): { MetricData: MetricData; Namespace: string } => ({
  MetricData: [
    {
      MetricName: "StatusCode",
      Unit: "None",
      Value: value,
      Dimensions: [{ Name: "Subdomain", Value: domain.name }]
    },
    {
      MetricName: "Alive",
      Unit: "None",
      Value: value >= 200 && value <= 300 ? 0 : 1,
      Dimensions: [{ Name: "Subdomain", Value: domain.name }]
    }
  ],
  Namespace: `${process.env.STAGE}/Subdomains`
});

const getStatus = async (
  domain: Domain
): Promise<{
  domain: Domain;
  response: number;
}> => {
  const result = await fetch(domain.endpoint).catch(err => {
    console.error(err, domain.endpoint);
    return { status: -1 };
  });
  return { domain, response: result.status };
};

export const handler = async (): Promise<{
  statusCode: number;
  body: string;
}> => {
  console.log("Starting up!");
  const { subdomains } = await fns.getConfigFromS3();
  console.log("Subdomains", subdomains);

  const client = new CloudWatch({ region: "eu-west-1" });

  await Promise.all(
    subdomains
      .map(domain => fns.getStatus(domain))
      .map(async response => {
        const d = await response;
        const met = metric(d.domain, d.response);
        await client.putMetricData(met).promise();
      })
  );

  console.log(`Uploaded metrics for ${subdomains.length} domains`);
  return {
    statusCode: 200,
    body: `Metrics sent for metrics: ${JSON.stringify(subdomains)}`
  };
};

export const fns = { getStatus, getConfigFromS3 };
