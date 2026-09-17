import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { GuStack } from '@guardian/cdk/lib/constructs/core';
import { GuLambdaFunction } from '@guardian/cdk/lib/constructs/lambda';
import type { App } from 'aws-cdk-lib';
import { aws_lambda as lambda } from 'aws-cdk-lib';
import { Architecture } from 'aws-cdk-lib/aws-lambda';

export class ImageCachePurger extends GuStack {
	constructor(scope: App, id: string, props: GuStackProps) {
		super(scope, id, props);

		const appName = 'image-cache-purger';

		new GuLambdaFunction(this, 'ImageCachePurgerHandler', {
			app: `${appName}-lambda`,
			fileName: `${appName}.zip`,
			functionName: `${appName}-${props.stage}`,
			handler: `${appName}.handler`,
			runtime: lambda.Runtime.NODEJS_24_X,
			architecture: Architecture.ARM_64,
			environment: {
				STAGE: props.stage,
			},
		});
	}
}

