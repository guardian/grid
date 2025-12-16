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
  '{"imageId": "3909f6ce899a70ebaf7065fe10f28fe4ebcff6d3", "bucket": "image-embedding-test", "filePath": "test-folder/Rex_Shutterstock_QuinsvBayonne_16081571ib (6b3eb5ee8562807483e165144d46d0dac0571773).jpg"}' \
  --profile media-service \
  --region eu-west-1

echo "Sent message to queue ${QUEUE_NAME}:"
