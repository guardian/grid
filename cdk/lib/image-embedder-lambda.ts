import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { GuStack } from '@guardian/cdk/lib/constructs/core';
import { GuParameter } from '@guardian/cdk/lib/constructs/core';
import { GuLambdaFunction } from '@guardian/cdk/lib/constructs/lambda';
import { GuS3Bucket } from '@guardian/cdk/lib/constructs/s3';
import type { App } from 'aws-cdk-lib';
import {
	Duration,
	aws_ec2 as ec2,
	Fn,
	aws_lambda as lambda,
	Stack,
} from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
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
		const vpcid = new GuParameter(this, 'VpcIdParam', {
			fromSSM: true,
			default: `/account/vpc/primary/id`,
		});

		const publicSubnetIds = new GuParameter(this, 'VpcPublicParam', {
			fromSSM: true,
			default: '/account/vpc/primary/subnets/public',
			type: 'List<String>',
		});

		const privateSubnetIds = new GuParameter(this, 'VpcPrivateParam', {
			fromSSM: true,
			default: '/account/vpc/primary/subnets/private',
			type: 'List<String>',
		});

		const vpc = Vpc.fromVpcAttributes(this, 'VPC', {
			vpcId: vpcid.valueAsString,
			publicSubnetIds: publicSubnetIds.valueAsList,
			privateSubnetIds: privateSubnetIds.valueAsList,
			// Use Fn.getAzs to get the AZs for this region, matching the number of subnets
			availabilityZones: Fn.getAzs(),
		});

		const lambdaSecurityGroup = new ec2.SecurityGroup(
			this,
			'ImageEmbedderLambdaSG',
			{
				vpc,
				description: 'Security group for image embedder lambda',
				allowAllOutbound: true,
			},
		);

		const esUrl = new GuParameter(this, 'EsURL', {
			fromSSM: true,
			default: `/${props.stage}/media-service/elasticsearch/url`,
		});

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
					// TODO: Get ES URL from SSM parameter or config
					ES_URL: esUrl.valueAsString,
				},
				vpc,
				securityGroups: [lambdaSecurityGroup],
			},
		);

		const imageEmbedderDLQ = new Queue(this, 'imageEmbedderDLQ', {
			queueName: `${appName}-DLQ-${this.stage}`,
			retentionPeriod: Duration.days(14),
		});

		const imageEmbedderQueue = new Queue(this, 'imageEmbedder', {
			queueName: `${appName}-${this.stage}`,
			visibilityTimeout: Duration.seconds(60),
			deadLetterQueue: {
				queue: imageEmbedderDLQ,
				maxReceiveCount: 3,
			},
		});
		imageEmbedderLambda.addEventSource(
			new SqsEventSource(imageEmbedderQueue, {
				reportBatchItemFailures: true,
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

		// Note: Elasticsearch access is controlled via VPC security groups
		// The lambda is now in the VPC and has a security group.
		// You'll need to update the Elasticsearch cluster's security group to allow
		// inbound traffic from ImageEmbedderLambdaSecurityGroup on port 9200 (or 443 if using HTTPS)
		// This is typically done manually or via the Elasticsearch stack's CloudFormation
	}
}
