import {GuScheduledLambda} from "@guardian/cdk";
import type {GuStackProps} from '@guardian/cdk/lib/constructs/core';
import {GuStack} from '@guardian/cdk/lib/constructs/core';
import {GuParameter} from '@guardian/cdk/lib/constructs/core';
import {GuVpc} from "@guardian/cdk/lib/constructs/ec2";
import {GuLambdaFunction} from '@guardian/cdk/lib/constructs/lambda';
import {GuS3Bucket} from '@guardian/cdk/lib/constructs/s3';
import type {App} from 'aws-cdk-lib';
import {
  Duration,
  aws_lambda as lambda,
  aws_s3 as s3,
  Stack,
} from 'aws-cdk-lib';
import { Schedule } from 'aws-cdk-lib/aws-events';
import {PolicyStatement} from 'aws-cdk-lib/aws-iam';
import {Architecture} from 'aws-cdk-lib/aws-lambda';
import {SqsEventSource} from 'aws-cdk-lib/aws-lambda-event-sources';
import {CfnIndex, CfnVectorBucket} from 'aws-cdk-lib/aws-s3vectors';
import { Queue } from 'aws-cdk-lib/aws-sqs';

const CONCURRENCY: Record<string, { backfill: number; loader: number; total: number }> = {
	'PROD': {
		backfill: 20,
		loader: 5,
		total: 35,
	},
	'TEST': {
		backfill: 5,
		loader: 5,
		total: 10,
	}

}

export class ImageEmbedder extends GuStack {
  constructor(scope: App, id: string, props: GuStackProps) {
    super(scope, id, props);

    const LAMBDA_NODE_VERSION = lambda.Runtime.NODEJS_24_X;

    const appName = 'image-embedder';
    const downscaledImageBucketName = `${this.stack}-${props.stage.toLowerCase()}-${appName}-downscaled-images`;

    const vectorBucket = new CfnVectorBucket(this, 'GridEmbeddingsVectorBucket', {
      vectorBucketName: `image-embeddings-${this.stage.toLowerCase()}`,
    });

    new CfnIndex(this, 'CohereV4Index', {
      dataType: 'float32',
      dimension: 1536,
      distanceMetric: 'cosine',
      indexName: 'cohere-embed-v4',
      vectorBucketArn: vectorBucket.attrVectorBucketArn
    });

    // These are exposed as parameters by the cloudformation in editorial-tools-platform
    // https://github.com/guardian/editorial-tools-platform/blob/ea68387e82d28642b23966635f813b0a8f3a2c0a/cloudformation/media-service-account/grid/media-service.yaml#L3270-L3283
    const thrallStreamArn = new GuParameter(this, 'ThrallMessageStreamArn', {
      fromSSM: true,
      default: `/${this.stage}/${this.stack}/thrall/message-stream-arn`,
      type: 'String',
    });
    const thrallKmsKeyArn = new GuParameter(this, 'ThrallKmsKeyArn', {
      fromSSM: true,
      default: `/${this.stage}/${this.stack}/thrall/kms-key-arn`,
      type: 'String',
    });
    const elasticSearchUrl = new GuParameter(this, 'ElasticSearchUrl', {
      fromSSM: true,
      default: `/${this.stage}/${this.stack}/elasticsearch/url`,
      type: 'String',
    });


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

    const backfillDLQ = new Queue(this, 'imageEmbedderBackfillDLQ', {
      queueName: `${appName}-backfill-DLQ-${this.stage}`,
      retentionPeriod: Duration.days(14),
    });

    const backfillQueue = new Queue(this, 'imageEmbedderBackfill', {
      queueName: `${appName}-backfill-${this.stage}`,
      visibilityTimeout: Duration.minutes(10),
      deadLetterQueue: {
        queue: backfillDLQ,
        maxReceiveCount: 3,
      },
    });

    const imageEmbedderLambda = new GuLambdaFunction(
			this,
			'ImageEmbedderHandler',
			{
				fileName: `${appName}.zip`,
				functionName: `${appName}-${props.stage}`,
				runtime: LAMBDA_NODE_VERSION,
				architecture: Architecture.ARM_64,
				handler: 'embedder.handler',
				app: `${appName}-lambda`,
				environment: {
					STAGE: props.stage,
					DOWNSCALED_IMAGE_BUCKET: downscaledImageBucketName,
					THRALL_KINESIS_STREAM_ARN: thrallStreamArn.valueAsString,
				},
				memorySize: 2048,
				timeout: Duration.minutes(1),
				reservedConcurrentExecutions: CONCURRENCY[this.stage]?.total ?? 1,
			},
		);

    const vpc = GuVpc.fromIdParameter(this, "AccountVPC");
    const subnets = GuVpc.subnetsFromParameter(this);

    const backfiller = new GuScheduledLambda(
      this,
      'ImageEmbedderBackfiller',
      {
        fileName: `${appName}.zip`,
        functionName: `${appName}-backfill-${props.stage}`,
        runtime: LAMBDA_NODE_VERSION,
        architecture: Architecture.ARM_64,
        handler: 'backfiller.handler',
        app: `${appName}-backfill-lambda`,
        environment: {
          STAGE: props.stage,
          ELASTIC_SEARCH_URL: elasticSearchUrl.valueAsString,
          BACKFILL_SQS_QUEUE: backfillQueue.queueUrl,
        },
        memorySize: 512,
        timeout: Duration.minutes(1),
        rules: [
					{
						schedule: Schedule.rate(Duration.minutes(1)),
						description: 'Frequency of execution of the backfiller',
					}
				],
        monitoringConfiguration: {
          noMonitoring: true,
        },
        vpc: vpc,
        vpcSubnets: {
          subnets: subnets,
        }
      },
    );

    backfillQueue.grantSendMessages(backfiller);
    backfiller.role?.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['sqs:GetQueueAttributes'],
        resources: [backfillQueue.queueArn],
      }),
    );


    imageEmbedderLambda.addEventSource(
			new SqsEventSource(imageEmbedderQueue, {
				reportBatchItemFailures: true,
				batchSize: 5,
				maxConcurrency: CONCURRENCY[this.stage]?.loader ?? 1,
			}),
		);

    imageEmbedderLambda.addEventSource(
			new SqsEventSource(backfillQueue, {
				reportBatchItemFailures: true,
				batchSize: 5,
				maxConcurrency: CONCURRENCY[this.stage]?.backfill ?? 1,
			}),
		);

    const downscaledImageBucket = new GuS3Bucket(
      this,
      'DownscaledImageBucket',
      {
        app: appName,
        bucketName: downscaledImageBucketName,
      },
    );
    downscaledImageBucket.grantReadWrite(imageEmbedderLambda);

    // Allow writing vectors to S3 vector index
    imageEmbedderLambda.role?.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['s3vectors:PutVectors'],
        resources: [
          `${vectorBucket.attrVectorBucketArn}/index/*`,
        ],
      }),
    );

    imageEmbedderLambda.role?.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['kinesis:PutRecord', 'kinesis:PutRecords'],
        resources: [thrallStreamArn.valueAsString],
      }),
    );
    imageEmbedderLambda.role?.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['kms:GenerateDataKey'],
        resources: [thrallKmsKeyArn.valueAsString],
      }),
    );

    // Allow invoking the Bedrock Cohere embeddings model.
    // When using a cross-region inference profile (global.*), the SDK may resolve
    // the model to a regionless foundation-model ARN, so we need to cover both forms.
    imageEmbedderLambda.role?.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/cohere.embed-english-v3`,
          `arn:aws:bedrock:${Stack.of(this).region}:${Stack.of(this).account}:inference-profile/global.cohere.embed-v4:0`,
          `arn:aws:bedrock:*::foundation-model/cohere.embed-v4:0`,
        ],
      }),
    );

    // Allow fetching the image from S3
    const imageBucket = s3.Bucket.fromBucketName(
      this,
      'ImageBucket',
      props.stage === 'PROD'
        ? 'media-service-prod-imagebucket-1luk2yux3owkh'
        : 'media-service-test-imagebucket-1qt2lbcwnpgl0',
    );
    imageBucket.grantRead(imageEmbedderLambda);
  }
}
