import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { GuStack } from '@guardian/cdk/lib/constructs/core';
import { GuLambdaFunction } from '@guardian/cdk/lib/constructs/lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import type { App } from 'aws-cdk-lib';
import { aws_lambda as lambda } from 'aws-cdk-lib';
import { Architecture } from 'aws-cdk-lib/aws-lambda';

type ImageCachePurgerProps = GuStackProps & {
  queueArn: string
}
export class ImageCachePurger extends GuStack {
	constructor(scope: App, id: string, props: ImageCachePurgerProps) {
		super(scope, id, props);

		const appName = 'image-cache-purger';

		const imagePurgerHandler = new GuLambdaFunction(this, 'ImageCachePurgerHandler', {
			app: `${appName}-lambda`,
			fileName: `${appName}.jar`,
			functionName: `${appName}-${props.stage}`,
			handler: 'com.gu.mediaservice.ImageCachePurger::handleRequest',
			runtime: lambda.Runtime.JAVA_25,
			architecture: Architecture.ARM_64,
			environment: {
				STAGE: props.stage,
			},
		});

    const queue = sqs.Queue.fromQueueArn(this,
      'ImageCachePurgerQueue',
      props.queueArn
    );
    imagePurgerHandler.addEventSource(new eventsources.SqsEventSource(queue))
	}
}
