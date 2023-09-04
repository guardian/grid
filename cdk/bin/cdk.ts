import 'source-map-support/register';
import { GuRootExperimental } from '@guardian/cdk/lib/experimental/constructs';
import { GridExtras } from '../lib/grid-extras';

const app = new GuRootExperimental();

const stack = 'media-service';

const env = {
	region: 'eu-west-1',
};

new GridExtras(app, 'grid-extras-TEST', {
	env,
	stack,
	stage: 'TEST',
	batchSize: 10, // since TEST ingests only 1% of PROD, we can use a smaller batch size (1000/100)
});

new GridExtras(app, 'grid-extras-PROD', {
	env,
	stack,
	stage: 'PROD',
	batchSize: 1000, // 1000 is the maximum batch size
});
