import { Kinesis } from "aws-sdk"

export const makeKinesisInstance = (
  isDev: boolean,
  awsConfig: Kinesis.ClientConfiguration = {}
): Kinesis => {
  return new Kinesis({
    ...awsConfig,
    // running locally needed to use localhost, not the proxy
    // error using  https://localstack.media.local.dev-gutools.co.uk was:
    // code: 'NetworkingError',
    // Error: unable to verify the first certificate
    endpoint: isDev ? "http://localhost:4566" : undefined,
    // TO DO - can we fix this with configuration?
  })
}
