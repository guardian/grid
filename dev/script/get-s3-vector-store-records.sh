#!/bin/bash

# Check if environment argument is provided
if [ $# -ne 1 ]; then
    echo "Usage: $0 <environment>"
    echo "Environment options: dev, test, prod"
    exit 1
fi

# Validate environment argument
env=$1
if [[ ! "$env" =~ ^(dev|test|prod)$ ]]; then
    echo "Invalid environment. Please use dev, test, or prod"
    exit 1
fi

aws s3vectors list-vectors \
  --vector-bucket-name "image-embeddings-$env" \
  --index-name cohere-embed-english-v3 \
  --profile media-service \
  --region eu-central-1