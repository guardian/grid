#!/usr/bin/env bash

source ./stack-name.sh usage

TABLE=`aws cloudformation list-stack-resources --stack-name $STACK_NAME | jq '.StackResourceSummaries[] | select(.LogicalResourceId == "UsageRecordTable") | .PhysicalResourceId' | tr -d '"'`

ROLE=`aws cloudformation list-stack-resources --stack-name $STACK_NAME | jq '.StackResourceSummaries[] | select(.LogicalResourceId == "UsageUpdaterRole") | .PhysicalResourceId' | tr -d '"'`

LAMBDA=`aws cloudformation list-stack-resources --stack-name $STACK_NAME | jq '.StackResourceSummaries[] | select(.LogicalResourceId == "UsageUpdaterFunction") | .PhysicalResourceId' | tr -d '"'`

aws dynamodb update-table \
    --stream-specification StreamEnabled=true,StreamViewType=NEW_IMAGE \
    --table-name $TABLE

TABLE_STREAM_ARN=`aws dynamodb describe-table --table-name ${TABLE} | jq ".Table.LatestStreamArn" | tr -d '"'`

POLICY_ID=`pwgen -1 --no-capitalize 20`

POLICY_NAME="dynamo-stream-`pwgen -1 --no-capitalize 20`"

JQ_FN="jq '.Statement[].Sid |= \"$POLICY_ID\" | .Statement[].Resource |= [\"$TABLE_STREAM_ARN\"]'"

cat usage-updater-lambda-policy.template.json | eval $JQ_FN > usage-updater-lambda-policy.json

aws iam put-role-policy \
    --role-name $ROLE \
    --policy-name $POLICY_NAME \
    --policy-document file://usage-updater-lambda-policy.json

aws lambda create-event-source-mapping \
    --batch-size 10 \
    --starting-position "LATEST" \
    --event-source-arn $TABLE_STREAM_ARN \
    --function-name $LAMBDA

rm usage-updater-lambda-policy.json
