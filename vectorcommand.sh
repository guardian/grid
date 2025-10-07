#!/bin/bash

aws s3vectors list-vectors \
  --vector-bucket-name image-embeddings-test \
  --index-name cohere-embed-english-v3 \
  --profile media-service \
  --region eu-central-1

