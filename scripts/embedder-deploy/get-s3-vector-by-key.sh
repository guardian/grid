#!/bin/bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Error: Index name and vector key arguments are required"
  echo ""
  echo "Usage: $0 <VECTOR_KEY>"
  echo ""
  echo "Example:"
  echo "  $0 9e3fec5784b8e203b9ee6139477d689cc9162c9a"
  exit 1
fi

VECTOR_KEY="$1"

# Write this to stderr so we can pipe get-vectors stdout to jq
>&2 echo "Fetching vector with key: ${VECTOR_KEY} from"

aws s3vectors get-vectors \
  --vector-bucket-name image-embeddings-via-lambda \
  --index-name cohere-embed-english-v3 \
  --return-data \
  --keys "${VECTOR_KEY}" \
  --return-metadata \
  --profile media-service \
  --region eu-central-1