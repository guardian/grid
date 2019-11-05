#!/usr/bin/env bash

export AWS_ACCESS_KEY_ID=foobar
export AWS_SECRET_ACCESS_KEY=foobar
export AWS_REGION=eu-west-2

stream_name=media-service-DEV-ThrallMessageQueue-1N0T2UXYNUIC9
aws --endpoint-url=http://localhost:4568 kinesis get-records --shard-iterator $(aws --endpoint-url=http://localhost:4568 kinesis get-shard-iterator --shard-id shardId-000000000000 --shard-iterator-type TRIM_HORIZON --stream-name "${stream_name}" --query "ShardIterator" --output text)
