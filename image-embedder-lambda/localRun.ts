#!/usr/bin/env ts-node

import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  StackResource,
} from "@aws-sdk/client-cloudformation";
import { KinesisClient, DescribeStreamCommand } from "@aws-sdk/client-kinesis";
import { Context, SQSEvent } from "aws-lambda";

const LOCALSTACK_ENDPOINT =
  process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
const QUEUE_URL =
  process.env.QUEUE_URL ||
  "http://localhost:4566/000000000000/image-embedder-DEV";
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);

const sqsClient = new SQSClient({
  region: "eu-west-1",
  endpoint: LOCALSTACK_ENDPOINT,
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
});

const cfnClient = new CloudFormationClient({
  region: "eu-west-1",
  endpoint: LOCALSTACK_ENDPOINT,
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
});

const kinesisClient = new KinesisClient({
  region: "eu-west-1",
  endpoint: LOCALSTACK_ENDPOINT,
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
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

async function main() {
  // Fetch resource names from CloudFormation stack
  const downscaledImageBucket = await getStackResource(
    "grid-dev-core",
    "DownscaledImageBucket",
  );
  const thrallStreamName = await getStackResource(
    "grid-dev-core",
    "ThrallMessageStream",
  );
  const thrallStreamArn = await getStreamArn(thrallStreamName);

  // Set all environment variables before importing handler
  process.env.AWS_PROFILE = "media-service";
  process.env.IS_LOCAL = "true";
  process.env.LOCALSTACK_ENDPOINT = LOCALSTACK_ENDPOINT;
  process.env.DOWNSCALED_IMAGE_BUCKET = downscaledImageBucket;
  process.env.THRALL_KINESIS_STREAM_ARN = thrallStreamArn;

  // Import handler AFTER setting environment variables
  // Use require() because ts-node hooks into require, not dynamic import()
  const { handler } = require("./src/index");

  console.log("Image Embedder Local Runner");
  console.log("============================");
  console.log(`Queue URL: ${QUEUE_URL}`);
  console.log(`Localstack Endpoint: ${LOCALSTACK_ENDPOINT}`);
  console.log(`Downscaled Image Bucket: ${downscaledImageBucket}`);
  console.log(`Thrall Kinesis Stream ARN: ${thrallStreamArn}`);
  console.log(`Poll Interval: ${POLL_INTERVAL_MS}ms`);
  console.log("");
  console.log("Waiting for messages...");
  console.log("");

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
                    ApproximateReceiveCount: "1",
                    SentTimestamp: Date.now().toString(),
                    SenderId: "local",
                    ApproximateFirstReceiveTimestamp: Date.now().toString(),
                  },
                  messageAttributes: {},
                  md5OfBody: message.MD5OfBody!,
                  eventSource: "aws:sqs",
                  eventSourceARN: `arn:aws:sqs:eu-west-1:000000000000:image-embedder-DEV`,
                  awsRegion: "eu-west-1",
                },
              ],
            };

            // Mock Lambda context
            const context: Context = {
              callbackWaitsForEmptyEventLoop: true,
              functionName: "image-embedder-DEV",
              functionVersion: "$LATEST",
              invokedFunctionArn:
                "arn:aws:lambda:eu-west-1:000000000000:function:image-embedder-DEV",
              memoryLimitInMB: "512",
              awsRequestId: Math.random().toString(36).substring(7),
              logGroupName: "/aws/lambda/image-embedder-DEV",
              logStreamName: new Date().toISOString(),
              getRemainingTimeInMillis: () => 60000,
              done: () => {},
              fail: () => {},
              succeed: () => {},
            };

            console.log("Invoking lambda handler...");
            await handler(event, context);
            console.log("✓ Lambda handler completed successfully");

            // Delete message from queue on success
            await sqsClient.send(
              new DeleteMessageCommand({
                QueueUrl: QUEUE_URL,
                ReceiptHandle: message.ReceiptHandle,
              }),
            );
            console.log("✓ Message deleted from queue");
          } catch (error) {
            console.error("✗ Lambda handler failed:", error);
            console.error("Message will be retried or sent to DLQ");
          }

          console.log("");
        }

        isProcessing = false;
      }
    } catch (error) {
      console.error("Error polling queue:", error);
      isProcessing = false;
    }
  }

  // Start polling
  setInterval(pollQueue, POLL_INTERVAL_MS);
  pollQueue(); // Start immediately
}

main().catch((error) => {
  console.error("Failed to start local runner:", error);
  process.exit(1);
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  process.exit(0);
});
