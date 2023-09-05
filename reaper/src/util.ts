import { S3 } from '@aws-sdk/client-s3';
import { SSM } from '@aws-sdk/client-ssm';
import { fromIni, fromNodeProviderChain } from '@aws-sdk/credential-providers';
import {
	AWS_REGION,
	buildRecordsBucketName,
	ENV_VAR_BATCH_SIZE,
	REAPER_APP_NAME,
	STACK,
} from '../../cdk/bin/constants';

export const getBatchSize = () => {
	const value = process.env[ENV_VAR_BATCH_SIZE as string];
	if (!value) {
		throw Error(
			`Missing environment variable '${ENV_VAR_BATCH_SIZE as string}'`,
		);
	}
	return value;
};

const LOCAL_PROFILE = 'media-service';

const IS_RUNNING_LOCALLY = !process.env.LAMBDA_TASK_ROOT;

const stage = process.env.STAGE ?? 'TEST';

const standardAwsConfig = {
	region: AWS_REGION as string,
	credentials: IS_RUNNING_LOCALLY
		? fromIni({ profile: LOCAL_PROFILE })
		: fromNodeProviderChain(),
};

const ssm = new SSM(standardAwsConfig);

const paramStorePromiseGetter =
	(WithDecryption: boolean) => (nameSuffix: string) => {
		const Name = `/${stage}/${STACK as string}/${
			REAPER_APP_NAME as string
		}/${nameSuffix}`;
		return ssm
			.getParameter({
				Name,
				WithDecryption,
			})
			.then((result) => {
				const value = result.Parameter?.Value;
				if (!value) {
					throw Error(`Could not retrieve parameter value for '${Name}'`);
				}
				return value;
			});
	};

export const getMediaApiHostname = () =>
	paramStorePromiseGetter(false)('mediaApiHostname');

export const getMediaApiKey = () =>
	paramStorePromiseGetter(true)('mediaApiKey');

const s3 = new S3(standardAwsConfig);
export const storeRecord = (recordDate: Date, data: object) =>
	s3.putObject({
		// eslint-disable-next-line -- bug in type system
		Bucket: buildRecordsBucketName(stage),
		Key: `${recordDate.getFullYear()}/${recordDate.getMonth()}/${recordDate.toISOString()}.json`,
		Body: JSON.stringify(data),
	});
