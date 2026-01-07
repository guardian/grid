#!/bin/bash
set -euo pipefail

# Fixed stage
STAGE="TEST"

QUEUE_NAME="image-embedder-${STAGE}"

QUEUE_URL=$(
  aws sqs get-queue-url \
    --queue-name "$QUEUE_NAME" \
    --query 'QueueUrl' \
    --output text \
    --profile media-service \
    --region eu-west-1
)

aws sqs send-message \
  --queue-url "$QUEUE_URL" \
  --message-body \
  '{"imageId": "793e7c27f213ed60b32bace6957fac428af8dbe2", "fileType": "image/tiff", "s3Bucket": "image-embedding-test", "s3Key": "test-folder/Edita Schubert ca 1983. Photo Marijan Susovski (793e7c27f213ed60b32bace6957fac428af8dbe2).tiff "}' \
  --profile media-service \
  --region eu-west-1

echo "Sent message to queue ${QUEUE_NAME}:"
