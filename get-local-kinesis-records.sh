#!/usr/bin/env bash

getRecords()
{
  aws --profile media-service --region=eu-west-1 --endpoint-url=http://localhost:4568 kinesis get-records \
 --shard-iterator $(aws --profile media-service --region=eu-west-1 --endpoint-url=http://localhost:4568 kinesis get-shard-iterator --shard-id shardId-000000000000 --shard-iterator-type TRIM_HORIZON --stream-name "$1" --query "ShardIterator" --output text)
}

echo "Thrall"
getRecords  media-service-DEV-ThrallMessageQueue-1N0T2UXYNUIC9

echo "Dead Letter 💀✉️"
getRecords media-service-DEV-deadletter-ThrallMessageQueue-1N0T2UXYNUIC9
