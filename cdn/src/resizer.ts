import { CloudFrontResponseEvent, CloudFrontResponseResult, Callback, Context, Handler } from 'aws-lambda';

export const handler: Handler = (event: CloudFrontResponseEvent, context: Context, cb: Callback<CloudFrontResponseResult>) => {
  const response = event.Records[0].cf.response;
  cb(null, response);
}