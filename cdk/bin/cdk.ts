import 'source-map-support/register';
import { GuRoot } from '@guardian/cdk/lib/constructs/root';
import { ImageCachePurger } from '../lib/image-cache-purger';
import { ImageEmbedder } from '../lib/image-embedder-lambda';

const app = new GuRoot();
new ImageEmbedder(app, 'ImageEmbedderLambda-euwest-1-PROD', {
	stack: 'media-service',
	stage: 'PROD',
	env: { region: 'eu-west-1' },
});
new ImageEmbedder(app, 'ImageEmbedderLambda-euwest-1-TEST', {
	stack: 'media-service',
	stage: 'TEST',
	env: { region: 'eu-west-1' },
});
new ImageCachePurger(app, 'ImageCachePurgerLambda-euwest-1-PROD', {
	imageBaseUrl: 'https://media.guim.co.uk',
  queueArn: "arn:aws:sqs:eu-west-1:563563610310:test",
  stack: 'media-service',
	stage: 'PROD',
	env: { region: 'eu-west-1' }
});
new ImageCachePurger(app, 'ImageCachePurgerLambda-euwest-1-TEST', {
	imageBaseUrl: 'https://media.test.dev-guim.co.uk',
  queueArn: `arn:aws:sqs:eu-west-1:563563610310:media-service-TEST-ImageNotificationQueue-rymVWjgDfJoy`,
  stack: 'media-service',
	stage: 'TEST',
	env: { region: 'eu-west-1' }
});
