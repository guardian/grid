import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { GuStack } from '@guardian/cdk/lib/constructs/core';
import { GuLambdaFunction } from '@guardian/cdk/lib/constructs/lambda';
import { GuS3Bucket } from '@guardian/cdk/lib/constructs/s3';
import type { App } from 'aws-cdk-lib';
import { Duration, aws_lambda as lambda, Stack } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Queue } from 'aws-cdk-lib/aws-sqs';

export class ImageEmbedder extends GuStack {
	constructor(scope: App, id: string, props: GuStackProps) {
		super(scope, id, props);

		const LAMBDA_NODE_VERSION = lambda.Runtime.NODEJS_24_X;

		const appName = 'image-embedder'
		const downscaledImageBucketName = `${this.stack}-${props.stage.toLowerCase()}-${appName}-downscaled-images`;

		const imageEmbedderLambda = new GuLambdaFunction(
			this,
			'ImageEmbedderHandler',
			{
				fileName: `${appName}.zip`,
				functionName: `${appName}-${props.stage}`,
				runtime: LAMBDA_NODE_VERSION,
				architecture: Architecture.ARM_64,
				handler: 'index.handler',
				app: `${appName}-lambda`,
				environment: {
					STAGE: props.stage,
					DOWNSCALED_IMAGE_BUCKET: downscaledImageBucketName,
				},
				memorySize: 2048,
				timeout: Duration.minutes(1)
			},
		);

		const imageEmbedderDLQ = new Queue(this, 'imageEmbedderDLQ', {
			queueName: `${appName}-DLQ-${this.stage}`,
			retentionPeriod: Duration.days(14),
		});

		const imageEmbedderQueue = new Queue(this, 'imageEmbedder', {
			queueName: `${appName}-${this.stage}`,
			visibilityTimeout: Duration.minutes(2),
			deadLetterQueue: {
				queue: imageEmbedderDLQ,
				maxReceiveCount: 3,
			},
		});
		imageEmbedderLambda.addEventSource(
			new SqsEventSource(imageEmbedderQueue, {
				reportBatchItemFailures: true,
				batchSize: 5,
				// We are seeing Bedrock client hanging under heavy load.
				// While we get to the bottom of this, we'd like to prevent this scenario
				// by aggressively limiting the concurrent lambda executions.
				maxConcurrency: 3,
			}),
		);
		const downscaledImageBucket = new GuS3Bucket(this, 'DownscaledImageBucket', {
			app: appName,
			bucketName: downscaledImageBucketName,
		});
		downscaledImageBucket.grantReadWrite(imageEmbedderLambda);

		// Allow writing vectors to S3 vector index
		imageEmbedderLambda.role?.addToPrincipalPolicy(
			new PolicyStatement({
				actions: ['s3vectors:PutVectors'],
				resources: [
					`arn:aws:s3vectors:eu-central-1:${Stack.of(this).account}:bucket/image-embeddings-${props.stage.toLowerCase()}/index/*`,
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
					`arn:aws:s3:::media-service-test-imagebucket-1qt2lbcwnpgl0/*`,
					`arn:aws:s3:::media-service-prod-imagebucket-1luk2yux3owkh/*`,
				],
			}),
		);
	}
}
