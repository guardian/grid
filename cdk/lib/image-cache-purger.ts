import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { GuStack } from '@guardian/cdk/lib/constructs/core';
import { GuLambdaFunction } from '@guardian/cdk/lib/constructs/lambda';
import type { App } from 'aws-cdk-lib';
import { aws_lambda as lambda } from 'aws-cdk-lib';
import { Architecture } from 'aws-cdk-lib/aws-lambda';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';

type ImageCachePurgerProps = GuStackProps & {
	imageBaseUrl: string;
  queueArn: string;
};
export class ImageCachePurger extends GuStack {
	constructor(scope: App, id: string, props: ImageCachePurgerProps) {
		super(scope, id, props);

		const appName = 'image-cache-purger';
		const fastlyApiKeySecret = secretsmanager.Secret.fromSecretNameV2(
			this,
			'FastlyApiKeySecret',
			`/${props.stage}/${props.stack}/${appName}/fastly-api-key`,
		);

		const imagePurgerHandler = new GuLambdaFunction(this, 'ImageCachePurgerHandler', {
			app: `${appName}-lambda`,
			fileName: `${appName}.jar`,
			functionName: `${appName}-${props.stage}`,
			handler: 'com.gu.mediaservice.ImageCachePurgerHandler::handleRequest',
			runtime: lambda.Runtime.JAVA_25,
			architecture: Architecture.ARM_64,
			environment: {
				STAGE: props.stage,
				FASTLY_API_KEY_SECRET_ID: fastlyApiKeySecret.secretFullArn || fastlyApiKeySecret.secretArn,
				FASTLY_IMAGE_BASE_URL: props.imageBaseUrl,
			},
		});
		fastlyApiKeySecret.grantRead(imagePurgerHandler);

    const queue = sqs.Queue.fromQueueArn(this,
      'ImageCachePurgerQueue',
      props.queueArn
    );
		imagePurgerHandler.addEventSource(new eventsources.SqsEventSource(queue));
	}
}
