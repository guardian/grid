#!/bin/bash
set -euo pipefail

# Check for required arguments
if [ $# -ne 4 ]; then
  echo "Usage: $0 <imageId> <fileType> <s3Bucket> <s3Key>"
  exit 1
fi

IMAGE_ID="$1"
FILE_TYPE="$2"
S3_BUCKET="$3"
S3_KEY="$4"

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
  "{\"imageId\": \"${IMAGE_ID}\", \"fileType\": \"${FILE_TYPE}\", \"s3Bucket\": \"${S3_BUCKET}\", \"s3Key\": \"${S3_KEY}\"}" \
  --profile media-service \
  --region eu-west-1

echo "Sent message to queue ${QUEUE_NAME}:"
