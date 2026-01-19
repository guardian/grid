#!/bin/bash
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Error: Stage and vector key arguments are required"
  echo ""
  echo "Usage: $0 <STAGE> <VECTOR_KEY>"
  echo ""
  echo "STAGE: test, dev, or prod"
  echo ""
  echo "Example:"
  echo "  $0 test 9e3fec5784b8e203b9ee6139477d689cc9162c9a"
  exit 1
fi

STAGE="$1"
VECTOR_KEY="$2"

if [[ ! "$STAGE" =~ ^(dev|test|prod)$ ]]; then
    echo "Invalid stage. Please use dev, test, or prod"
    exit 1
fi


# Write this to stderr so we can pipe get-vectors stdout to jq
>&2 echo "Fetching vector with key: ${VECTOR_KEY} from ${STAGE}"

aws s3vectors get-vectors \
  --vector-bucket-name image-embeddings-"${STAGE}" \
  --index-name cohere-embed-english-v3 \
  --return-data \
  --keys "${VECTOR_KEY}" \
  --return-metadata \
  --profile media-service \
  --region eu-central-1