# Embedder Lambda

This is a service responsible for embedding uploaded images to the Grid and writing those embeddings to the S3 Vector Store.

## Running Locally with Localstack

The ImageEmbedder queue can be run locally by polling the localstack SQS queue and executing the lambda code with the help of the `localRun` script.

### What Actually Runs

The local runner:

- ✅ **Polls the localstack SQS queue** for messages
- ✅ **Executes the lambda handler code**
- ✅ **Fetches images from localstack S3**
- ⚠️ **Calls AWS Bedrock** for embeddings (requires AWS credentials)
- ⚠️ **Stores vectors in AWS S3 Vectors** (requires AWS credentials)

**Important:** Bedrock and S3 Vectors are not available in localstack, so the lambda will connect to **AWS services**. Make sure you have AWS credentials configured.

### Prerequisites

1. Core CloudFormation stack deployed to localstack (run `dev/script/setup.sh`)
1. Localstack running via `dev/script/start.sh`
1. Dependencies installed: `npm install`
1. **AWS credentials configured** for Bedrock and S3 Vectors access

### Start the Local Runner

```bash
npm run local
```

This will:

- Build the lambda code
- Start polling the localstack SQS queue (`image-embedder-DEV`)
- Execute the lambda handler when messages arrive
- Delete messages from the queue on success
- Allow failed messages to retry or go to the DLQ

### Configuration

Environment variables you can set:

- `LOCALSTACK_ENDPOINT` - Localstack endpoint (default: `http://localhost:4566`)
- `QUEUE_URL` - Full SQS queue URL (default: `http://localhost:4566/000000000000/image-embedder-DEV`)
- `POLL_INTERVAL_MS` - How often to poll for messages (default: `5000`)
- `AWS_PROFILE` - AWS credentials profile to use for Bedrock/S3 Vectors

Example:

```bash
AWS_PROFILE=media-service POLL_INTERVAL_MS=2000 npm run local
```

### Testing

To test the lambda locally, send a message to the queue:

```bash
aws sqs send-message \
  --queue-url http://localhost:4566/000000000000/image-embedder-DEV \
  --message-body '{"imageId":"test-123","s3Bucket":"media-service-test-imagebucket","s3Key":"test/image.jpg","fileType":"image/jpeg"}' \
  --endpoint-url http://localhost:4566
```

The lambda will:

1. Receive the message from localstack
2. Try to fetch the image from the S3 bucket specified (localstack if bucket exists there, or real AWS)
3. Send the image to AWS Bedrock for embedding
4. Store the embedding in AWS S3 Vectors
