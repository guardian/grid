import { GuScheduledLambda } from '@guardian/cdk';
import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import {
	GuStack,
} from '@guardian/cdk/lib/constructs/core';
import type { App } from 'aws-cdk-lib';
import {aws_events, aws_lambda, aws_ssm, Duration, SecretValue} from 'aws-cdk-lib';
import {
	ENV_VAR_BATCH_SIZE,
	ENV_VAR_MEDIA_API_HOSTNAME,
	ENV_VAR_MEDIA_API_KEY,
} from '../../reaper/src/envVariables';

const ALARM_SNS_TOPIC_NAME = 'Cloudwatch-Alerts';

interface GridExtrasProps extends GuStackProps {
	batchSize: number;
}
export class GridExtras extends GuStack {
	constructor(scope: App, id: string, props: GridExtrasProps) {
		super(scope, id, props);

		const reaperApp = 'grid-reaper';
		new GuScheduledLambda(this, 'ReaperLambda', {
			app: reaperApp,
			functionName: `grid-reaper-lambda-${this.stage}`,
			runtime: aws_lambda.Runtime.NODEJS_16_X, // upgrade when .nvmrc is updated
			handler: 'index.handler',
			environment: {
				[ENV_VAR_BATCH_SIZE]: props.batchSize.toString(),
				[ENV_VAR_MEDIA_API_HOSTNAME]: aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/${this.stage}/${props.stack}/${reaperApp}/mediaApiHostname`
        ),
				[ENV_VAR_MEDIA_API_KEY]: SecretValue.ssmSecure(
          `/${this.stage}/${props.stack}/${reaperApp}/mediaApiKey`,

        ).toString()
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
	}
}
