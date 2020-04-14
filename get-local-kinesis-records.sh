#!/usr/bin/env bash

set -e

STREAM_NAME=${1:-media-service-DEV-thrall}
LIMIT=${2:-100}

ITERATOR=$(aws kinesis get-shard-iterator \
  --endpoint-url=http://localhost:4566 \
  --profile media-service \
  --region=eu-west-1 \
  --shard-id shardId-000000000000 \
  --shard-iterator-type TRIM_HORIZON \
  --stream-name "$STREAM_NAME" \
  --query "ShardIterator" \
  --output text)

DATA=$(aws kinesis get-records \
  --endpoint-url=http://localhost:4566 \
  --profile media-service \
  --region=eu-west-1 \
  --limit "$LIMIT" \
  --shard-iterator "$ITERATOR" \
  | jq -r '.Records[].Data')

for i in $DATA; do
  echo "$i" | base64 -d | tail -c +2 | gunzip
done | jq -s 'map(.)'
