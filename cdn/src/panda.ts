import { CloudFrontRequestEvent, CloudFrontRequestResult, Callback, Context, Handler } from 'aws-lambda';

export const handler: Handler = (event: CloudFrontRequestEvent, context: Context, cb: Callback<CloudFrontRequestResult>) => {
  const request = event.Records[0].cf.request;
  cb(null, request);
}