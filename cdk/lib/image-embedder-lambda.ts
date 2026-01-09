import type { GuStackProps } from "@guardian/cdk/lib/constructs/core";
import { GuStack } from "@guardian/cdk/lib/constructs/core";
import { GuLambdaFunction } from "@guardian/cdk/lib/constructs/lambda";
import type { App } from "aws-cdk-lib";
import { Duration, aws_lambda as lambda, Stack } from "aws-cdk-lib";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Architecture } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Queue } from "aws-cdk-lib/aws-sqs";

export class MediaService extends GuStack {
  constructor(scope: App, id: string, props: GuStackProps) {
    super(scope, id, props);

    const LAMBDA_NODE_VERSION = lambda.Runtime.NODEJS_24_X;

    const imageEmbedderLambda = new GuLambdaFunction(
      this,
      'ImageEmbedderHandler',
      {
        fileName: 'image-embedder.zip',
        functionName: `image-embedder-${props.stage}`,
        runtime: LAMBDA_NODE_VERSION,
        architecture: Architecture.ARM_64,
        handler: 'index.handler',
        app: 'image-embedder-lambda',
      },
    );

    const imageEmbedderDLQ = new Queue(this, 'imageEmbedderDLQ', {
			queueName: `image-embedder-DLQ-${this.stage}`,
		});

		const imageEmbedderQueue = new Queue(
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
		imageEmbedderLambda.addEventSource(
			new SqsEventSource(imageEmbedderQueue),
		);

    // Allow writing vectors to S3 vector index
		imageEmbedderLambda.role?.addToPrincipalPolicy(
			new PolicyStatement({
			  actions: [
				's3vectors:PutVectors',
			  ],
			  resources: [
				  `arn:aws:s3vectors:eu-central-1:${Stack.of(this).account}:bucket/image-embeddings-via-lambda/index/*`,
			  ],
			}),
		);

    // Allow invoking the Bedrock Cohere embeddings model
		imageEmbedderLambda.role?.addToPrincipalPolicy(
			new PolicyStatement({
			  actions: ['bedrock:InvokeModel'],
			  resources: [
				  `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/cohere.embed-english-v3`,
			  ],
			}),
		);

	// Allow fetching the image from S3
		imageEmbedderLambda.role?.addToPrincipalPolicy(
			new PolicyStatement({
			  actions: ['s3:GetObject'],
			  resources: [
				  `arn:aws:s3:::image-embedding-test/*`,
			  ],
  			}),
		);
  }
}