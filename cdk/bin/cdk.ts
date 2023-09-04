import 'source-map-support/register';
import { GuRootExperimental } from '@guardian/cdk/lib/experimental/constructs';
import { GridExtras } from '../lib/grid-extras';
import { AWS_REGION, STACK } from './constants';

const app = new GuRootExperimental();

const env = {
	region: AWS_REGION,
};

new GridExtras(app, 'grid-extras-TEST', {
	env,
	stack: STACK,
	stage: 'TEST',
	batchSize: 10, // since TEST ingests only 1% of PROD, we can use a smaller batch size (1000/100)
});

new GridExtras(app, 'grid-extras-PROD', {
	env,
	stack: STACK,
	stage: 'PROD',
	batchSize: 1000, // 1000 is the maximum batch size
});
