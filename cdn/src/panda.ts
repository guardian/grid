import { CloudFrontRequestEvent, CloudFrontRequestResult, Callback, Context, Handler, CloudFrontRequest } from 'aws-lambda';

import { parse } from 'cookie';
import { getPEM } from 'pan-domain-public-keys';
import validateUser from 'pan-domain-validate-user';

const { STAGE } = process.env;

function handle(request: CloudFrontRequest): Promise<CloudFrontRequestResult> {
  const cookie = parse(request.headers['cookie'][0].value)['gutoolsAuth-assym'];

  return getPEM(STAGE).then(key => {
    return validateUser(key, cookie).then((_: void) => request);
  });
}

export const handler: Handler = (event: CloudFrontRequestEvent, context: Context, cb: Callback<CloudFrontRequestResult>) => {
  const request = event.Records[0].cf.request;
  handle(request).then(resp => cb(null, resp)).catch(err => cb(err, null));
}