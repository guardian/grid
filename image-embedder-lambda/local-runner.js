#!/usr/bin/env node

/**
 * Local runner for the image-embedder lambda
 * Polls the localstack SQS queue and invokes the lambda handler when messages arrive
 */

const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");
const { handler } = require("./dist/index.js");

// Configure for localstack
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

console.log("Image Embedder Local Runner");
console.log("============================");
console.log(`Queue URL: ${QUEUE_URL}`);
console.log(`Localstack Endpoint: ${LOCALSTACK_ENDPOINT}`);
console.log(`Poll Interval: ${POLL_INTERVAL_MS}ms`);
console.log("");
console.log("Waiting for messages...");
console.log("");

let isProcessing = false;

async function pollQueue() {
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
          const event = {
            Records: [
              {
                messageId: message.MessageId,
                receiptHandle: message.ReceiptHandle,
                body: message.Body,
                attributes: message.Attributes || {},
                messageAttributes: message.MessageAttributes || {},
                md5OfBody: message.MD5OfBody,
                eventSource: "aws:sqs",
                eventSourceARN: `arn:aws:sqs:eu-west-1:000000000000:image-embedder-DEV`,
                awsRegion: "eu-west-1",
              },
            ],
          };

          // Mock Lambda context
          const context = {
            functionName: "image-embedder-DEV",
            invokedFunctionArn:
              "arn:aws:lambda:eu-west-1:000000000000:function:image-embedder-DEV",
            awsRequestId: Math.random().toString(36).substring(7),
            logGroupName: "/aws/lambda/image-embedder-DEV",
            logStreamName: new Date().toISOString(),
          };

          console.log("Invoking lambda handler...");
          await handler(event, context);
          console.log("✓ Lambda handler completed successfully");

          // Delete message from queue on success
          await sqsClient.send(
            new DeleteMessageCommand({
              QueueUrl: QUEUE_URL,
              ReceiptHandle: message.ReceiptHandle,
            })
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

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  process.exit(0);
});
