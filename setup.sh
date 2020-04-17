#!/usr/bin/env bash

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

export AWS_PAGER=""
export AWS_CBOR_DISABLE=true
export AWS_PROFILE=media-service
export AWS_DEFAULT_REGION=eu-west-1

LOCALSTACK_ENDPOINT=http://localhost:4566
LOCALSTACK_CONFIG_DIR=$DIR/localstack/config

createS3Buckets() {
  echo "creating buckets"

  currentBuckets=$(aws s3api list-buckets --endpoint-url $LOCALSTACK_ENDPOINT)

  for file in "$LOCALSTACK_CONFIG_DIR"/s3/*-bucket.json; do
    name=$(jq -r '.Bucket' < "$file")

    exists=$(echo "$currentBuckets" | jq -r ".Buckets[].Name | select(. == \"$name\")")

    if [[ -z $exists ]]; then
      aws s3api create-bucket \
        --cli-input-json file://"$file" \
        --endpoint-url $LOCALSTACK_ENDPOINT
      echo "  created bucket using $(basename "$file")"
    else
      echo "  skipping $(basename "$file") as bucket $name already exists"
    fi
  done
}

putS3BucketCors() {
  echo "putting bucket cors"
  for file in "$LOCALSTACK_CONFIG_DIR"/s3/*-cors.json; do
    aws s3api put-bucket-cors \
      --cli-input-json file://"$file" \
      --endpoint-url $LOCALSTACK_ENDPOINT
    echo "  put bucket cors using $(basename "$file")"
  done
}

putS3BucketVersioning() {
  echo "putting bucket versioning"
  for file in "$LOCALSTACK_CONFIG_DIR"/s3/*-versioning.json; do
    aws s3api put-bucket-versioning \
      --cli-input-json file://"$file" \
      --endpoint-url $LOCALSTACK_ENDPOINT
    echo "  put bucket versioning using $(basename "$file")"
  done
}

putS3BucketWebsite() {
  echo "putting bucket website"
  for file in "$LOCALSTACK_CONFIG_DIR"/s3/*-website.json; do
    aws s3api put-bucket-website \
      --cli-input-json file://"$file" \
      --endpoint-url $LOCALSTACK_ENDPOINT
    echo "  put bucket website using $(basename "$file")"
  done
}

createDynamoDbTables() {
  echo "creating dynamodb tables"
  for file in "$LOCALSTACK_CONFIG_DIR"/dynamodb/*-table.json; do
    aws dynamodb create-table \
      --cli-input-json file://"$file" \
      --endpoint-url $LOCALSTACK_ENDPOINT >/dev/null
    echo "  created table using $(basename "$file")"
  done
}

createSNSTopics() {
  echo "creating sns topics"
  for file in "$LOCALSTACK_CONFIG_DIR"/sns/*-topic.json; do
    aws sns create-topic \
      --cli-input-json file://"$file" \
      --endpoint-url $LOCALSTACK_ENDPOINT >/dev/null
    echo "  created sns topic using $(basename "$file")"
  done
}

createSQSQueues() {
  echo "creating sqs queues"
  for file in "$LOCALSTACK_CONFIG_DIR"/sqs/*-queue.json; do
    aws sqs create-queue \
      --cli-input-json file://"$file" \
      --endpoint-url $LOCALSTACK_ENDPOINT >/dev/null
    echo "  created sqs queue using $(basename "$file")"
  done
}

createSNSSubscriptions() {
  echo "creating sns subscriptions"
  for file in "$LOCALSTACK_CONFIG_DIR"/sns/*-subscribe.json; do
    aws sns subscribe \
      --cli-input-json file://"$file" \
      --endpoint-url $LOCALSTACK_ENDPOINT >/dev/null
    echo "  created sns subscription using $(basename "$file")"
  done
}

createKinesisStreams() {
  echo "creating kinesis streams"

  currentStreams=$(aws kinesis list-streams --endpoint-url $LOCALSTACK_ENDPOINT)

  for file in "$LOCALSTACK_CONFIG_DIR"/kinesis/*.json; do
    name=$(jq -r '.StreamName' < "$file")

    exists=$(echo "$currentStreams" | jq -r ".StreamNames[] | select(. == \"$name\")")

    if [[ -z $exists ]]; then
      aws kinesis create-stream \
        --cli-input-json file://"$file" \
        --endpoint-url $LOCALSTACK_ENDPOINT
      echo "  created kinesis stream using $(basename "$file")"
    else
      echo "  skipping $(basename "$file") as stream $name already exists"
    fi
  done
}

startDocker() {
  docker-compose up -d

  echo "waiting for localstack to launch on $LOCALSTACK_ENDPOINT"
  while ! curl -s $LOCALSTACK_ENDPOINT >/dev/null; do
    sleep 1 # wait for 1 second before check again
  done
}

setupDevNginx() {
  dev-nginx setup-app "$DIR/nginx-mappings.yml"
}

setupImgOps() {
  if [ ! -f ./imgops/dev/nginx.conf ]; then
    cp "$DIR/imgops/dev/nginx.conf.localstack" "$DIR/imgops/dev/nginx.conf"
  fi
}

setupDevNginx
startDocker
setupImgOps
createS3Buckets
putS3BucketCors
putS3BucketVersioning
putS3BucketWebsite
createDynamoDbTables
createSNSTopics
createSQSQueues
createSNSSubscriptions
createKinesisStreams
