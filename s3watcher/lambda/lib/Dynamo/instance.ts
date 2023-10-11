import { DynamoDB } from "aws-sdk"

export const makeDDBInstance = (
  isDev: boolean,
  awsConfig: DynamoDB.ClientConfiguration = {}
): DynamoDB => {
  return new DynamoDB({
    ...awsConfig,
    apiVersion: "2012-08-10",
    // running locally needed to use localhost, not the proxy
    // error using  https://localstack.media.local.dev-gutools.co.uk was:
    // code: 'NetworkingError',
    // Error: unable to verify the first certificate
    endpoint: isDev ? "http://localhost:4566" : undefined,
    // TO DO - can we fix this with configuration?
  })
}
