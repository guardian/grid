#!/usr/bin/env ts-node

import {
	SQSClient,
	ReceiveMessageCommand,
	DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import {
	CloudFormationClient,
	DescribeStackResourcesCommand,
	StackResource,
} from '@aws-sdk/client-cloudformation';
import { SQSEvent } from 'aws-lambda';
import { DescribeStreamCommand, KinesisClient } from '@aws-sdk/client-kinesis';
import {
	AWSClients,
	computeEmbeddingForSQSEvent,
	Environment,
} from './embedder.ts';
import { S3Client } from '@aws-sdk/client-s3';
import { S3VectorsClient } from '@aws-sdk/client-s3vectors';
import { createBedrockClient } from './imageEmbedder.ts';

process.env.AWS_PROFILE = process.env.AWS_PROFILE || 'media-service';

const LOCALSTACK_ENDPOINT =
	process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const QUEUE_URL =
	process.env.QUEUE_URL ||
	'http://localhost:4566/000000000000/image-embedder-DEV';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);

const sqsClient = new SQSClient({
	region: 'eu-west-1',
	endpoint: LOCALSTACK_ENDPOINT,
	credentials: {
		accessKeyId: 'test',
		secretAccessKey: 'test',
	},
});

const cfnClient = new CloudFormationClient({
	region: 'eu-west-1',
	endpoint: LOCALSTACK_ENDPOINT,
	credentials: {
		accessKeyId: 'test',
		secretAccessKey: 'test',
	},
});

const kinesisClient = new KinesisClient({
	region: 'eu-west-1',
	endpoint: LOCALSTACK_ENDPOINT,
	credentials: {
		accessKeyId: 'test',
		secretAccessKey: 'test',
	},
});

async function getStackResource(
	stackName: string,
	logicalResourceId: string,
): Promise<string> {
	const response = await cfnClient.send(
		new DescribeStackResourcesCommand({ StackName: stackName }),
	);
	const resource = response.StackResources?.find(
		(r: StackResource) => r.LogicalResourceId === logicalResourceId,
	);
	if (!resource?.PhysicalResourceId) {
		throw new Error(
			`Resource ${logicalResourceId} not found in stack ${stackName}`,
		);
	}
	return resource.PhysicalResourceId;
}

// Perhaps we could put the ARNs in the localstack parameter store
// and get them out that way in the future
// This would be more similar to what we do in the cdk stack
async function getStreamArn(streamName: string): Promise<string> {
	const response = await kinesisClient.send(
		new DescribeStreamCommand({ StreamName: streamName }),
	);
	const arn = response.StreamDescription?.StreamARN;
	if (!arn) {
		throw new Error(`Could not get ARN for Kinesis stream ${streamName}`);
	}
	return arn;
}

function initializeHandlerAwsClients(): AWSClients {
	const localStack = {
		endpoint: LOCALSTACK_ENDPOINT,
		forcePathStyle: true,
		credentials: {
			accessKeyId: 'test',
			secretAccessKey: 'test',
		},
	};
	return {
		kinesis: new KinesisClient({ region: 'eu-west-1', ...localStack }),
		s3: new S3Client({ region: 'eu-west-1', ...localStack }),
		// S3 Vectors is not supported by LocalStack, so we connect directly to real AWS
		s3VectorsClient: new S3VectorsClient({ region: 'eu-west-1' }),
		bedrockClient: createBedrockClient(),
	};
}

async function main() {
	const awsClients = initializeHandlerAwsClients();
	// Fetch bucket name from CloudFormation stack
	const downscaledImageBucket = await getStackResource(
		'grid-dev-core',
		'DownscaledImageBucket',
	);

	const thrallStreamName = await getStackResource(
		'grid-dev-core',
		'ThrallMessageStream',
	);
	const thrallStreamArn = await getStreamArn(thrallStreamName);

	const environment: Environment = {
		isLocal: true,
		stage: 'dev',
		downscaledImageBucket: downscaledImageBucket,
		thrallKinesisStreamArn: thrallStreamArn,
	};

	console.log('Image Embedder Local Runner');
	console.log('============================');
	console.log(`Queue URL: ${QUEUE_URL}`);
	console.log(`Localstack Endpoint: ${LOCALSTACK_ENDPOINT}`);
	console.log(`Downscaled Image Bucket: ${downscaledImageBucket}`);
	console.log(`Thrall Kinesis Stream ARN: ${thrallStreamArn}`);
	console.log(`Poll Interval: ${POLL_INTERVAL_MS}ms`);
	console.log('');
	console.log('Waiting for messages...');
	console.log('');

	let isProcessing = false;

	async function pollQueue(): Promise<void> {
		if (isProcessing) {
			return;
		}

		try {
			const command = new ReceiveMessageCommand({
				QueueUrl: QUEUE_URL,
				MaxNumberOfMessages: 1,
				WaitTimeSeconds: 10, // Long polling
				VisibilityTimeout: 60,
			});

			const response = await sqsClient.send(command);

			if (response.Messages && response.Messages.length > 0) {
				isProcessing = true;

				for (const message of response.Messages) {
					console.log(`[${new Date().toISOString()}] Received message`);
					console.log(`Message ID: ${message.MessageId}`);

					try {
						// Convert SQS message to Lambda SQS event format
						const event: SQSEvent = {
							Records: [
								{
									messageId: message.MessageId!,
									receiptHandle: message.ReceiptHandle!,
									body: message.Body!,
									attributes: {
										ApproximateReceiveCount: '1',
										SentTimestamp: Date.now().toString(),
										SenderId: 'local',
										ApproximateFirstReceiveTimestamp: Date.now().toString(),
									},
									messageAttributes: {},
									md5OfBody: message.MD5OfBody!,
									eventSource: 'aws:sqs',
									eventSourceARN: `arn:aws:sqs:eu-west-1:000000000000:image-embedder-DEV`,
									awsRegion: 'eu-west-1',
								},
							],
						};

						console.log('Invoking lambda handler...');
						await computeEmbeddingForSQSEvent(awsClients, event, environment);
						console.log('✓ Lambda handler completed successfully');

						// Delete message from queue on success
						await sqsClient.send(
							new DeleteMessageCommand({
								QueueUrl: QUEUE_URL,
								ReceiptHandle: message.ReceiptHandle,
							}),
						);
						console.log('✓ Message deleted from queue');
					} catch (error) {
						console.error('✗ Lambda handler failed:', error);
						console.error('Message will be retried or sent to DLQ');
					}

					console.log('');
				}

				isProcessing = false;
			}
		} catch (error) {
			console.error('Error polling queue:', error);
			isProcessing = false;
		}
	}

	// Start polling
	setInterval(pollQueue, POLL_INTERVAL_MS);
	pollQueue(); // Start immediately
}

main().catch((error) => {
	console.error('Failed to start local runner:', error);
	process.exit(1);
});
