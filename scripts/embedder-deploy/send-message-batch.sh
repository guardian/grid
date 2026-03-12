#!/bin/bash
set -euo pipefail

# This script send a batch of duplicate messages and the handler will loop through them. 
# BUT the write to the S3 Vector Store will fail because we're trying to write duplicate keys! 
# Right now, this script is just useful for testing the loop behaviour 
# and perhaps may be useful in the future to test skipping images already embedded (when we add that)

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
# Build entries using jq
ENTRIES=$(jq -n \
  --arg imageId "$IMAGE_ID" \
  --arg fileType "$FILE_TYPE" \
  --arg s3Bucket "$S3_BUCKET" \
  --arg s3Key "$S3_KEY" \
  '[range(1;11) | {
    Id: ("msg-" + (. | tostring)),
    MessageBody: ({imageId: $imageId, fileType: $fileType, s3Bucket: $s3Bucket, s3Key: $s3Key} | tostring)
  }]')

aws sqs send-message-batch \
  --queue-url "$QUEUE_URL" \
  --entries "$ENTRIES" \
  --profile media-service \
  --region eu-west-1