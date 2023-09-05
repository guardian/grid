import { GuScheduledLambda } from '@guardian/cdk';
import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { GuStack } from '@guardian/cdk/lib/constructs/core';
import { GuS3Bucket } from '@guardian/cdk/lib/constructs/s3';
import type { App } from 'aws-cdk-lib';
import { aws_events, aws_lambda, Duration } from 'aws-cdk-lib';
import {
	buildRecordsBucketName,
	ENV_VAR_BATCH_SIZE,
	REAPER_APP_NAME,
} from '../bin/constants';

const ALARM_SNS_TOPIC_NAME = 'Cloudwatch-Alerts';

interface GridExtrasProps extends GuStackProps {
	batchSize: number;
}
export class GridExtras extends GuStack {
	constructor(scope: App, id: string, props: GridExtrasProps) {
		super(scope, id, props);

		const reaperAppName = REAPER_APP_NAME as string;
		const reaperRecordsBucket = new GuS3Bucket(this, 'ReaperRecordsBucket', {
			app: reaperAppName,
			bucketName: buildRecordsBucketName(this.stage),
			versioned: true,
		});
		const reaperLambda = new GuScheduledLambda(this, 'ReaperLambda', {
			app: reaperAppName,
			functionName: `${reaperAppName}-lambda-${this.stage}`,
			runtime: aws_lambda.Runtime.NODEJS_18_X,
			handler: 'index.handler',
			environment: {
				[ENV_VAR_BATCH_SIZE]: props.batchSize.toString(),
			},
			monitoringConfiguration: {
				toleratedErrorPercentage: 0,
				snsTopicName: ALARM_SNS_TOPIC_NAME,
				okAction: true,
			},
			fileName: 'grid-reaper.zip',
			rules: [
				{
					// every 15mins at 1000 each time = 96,000 per day
					schedule: aws_events.Schedule.rate(Duration.minutes(15)),
					description:
						'Run every 15 mins to ensure we keep on top of the backlog of images to be reaped',
				},
			],
		});
		reaperRecordsBucket.grantReadWrite(reaperLambda);
	}
}
