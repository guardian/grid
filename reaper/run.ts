import { ENV_VAR_BATCH_SIZE } from '../cdk/bin/constants';
import { handler } from './src';

process.env[ENV_VAR_BATCH_SIZE as string] = '3';
process.env.STAGE = 'TEST';

void handler().then(() => console.log('DONE'));
