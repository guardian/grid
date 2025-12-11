import type { GuStackProps } from "@guardian/cdk/lib/constructs/core";
import { GuStack } from "@guardian/cdk/lib/constructs/core";
import { GuLambdaFunction } from "@guardian/cdk/lib/constructs/lambda";
import type { App } from "aws-cdk-lib";
import { Duration, aws_lambda as lambda } from "aws-cdk-lib";
import { Architecture } from "aws-cdk-lib/aws-lambda";
// import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Queue } from "aws-cdk-lib/aws-sqs";

export class MediaService extends GuStack {
  constructor(scope: App, id: string, props: GuStackProps) {
    super(scope, id, props);

    const LAMBDA_NODE_VERSION = lambda.Runtime.NODEJS_24_X;

    const imageEmbedderApiKey = Secret.fromSecretNameV2(
			this,
			'imageEmbedderApiKey',
			`media-service/${props.stage}/image-embedder-lambda/api-key`,
		);

    // const imageEmbedderLambda = 
    new GuLambdaFunction(
      this,
      'ImageEmbedderHandler',
      {
        fileName: 'image-embedder.zip',
        functionName: `image-embedder-${props.stage}`,
        runtime: LAMBDA_NODE_VERSION,
        architecture: Architecture.ARM_64,
        handler: 'index.handler',
        app: 'image-embedder-lambda',
        environment: {
					"GRID_API_KEY": imageEmbedderApiKey.secretValue.toString()
				}
      },
    );

    const imageEmbedderDLQ = new Queue(this, 'imageEmbedderDLQ', {
			queueName: `image-embedder-DLQ-${this.stage}`,
		});

		// const imageEmbedderQueue = 
    new Queue(
			this,
			'imageEmbedder',
			{
				queueName: `image-embedder-${this.stage}`,
				visibilityTimeout: Duration.seconds(60),
				deadLetterQueue: {
					queue: imageEmbedderDLQ,
					maxReceiveCount: 3,
				},
			},
		);
		// imageEmbedderLambda.addEventSource(
		// 	new SqsEventSource(imageEmbedderQueue),
		// );

  }
}