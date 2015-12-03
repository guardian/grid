#!/usr/bin/env bash

source ./utils.sh
source ./stack-name.sh usage

TABLE=`get_stack_resource_physical_id $STACK_NAME UsageRecordTable`
ROLE=`get_stack_resource_physical_id $STACK_NAME UsageUpdaterRole`
LAMBDA=`get_stack_resource_physical_id $STACK_NAME UsageUpdaterFunction`

aws dynamodb update-table \
    --stream-specification StreamEnabled=true,StreamViewType=NEW_IMAGE \
    --table-name $TABLE

TABLE_STREAM_ARN=`aws dynamodb describe-table --table-name ${TABLE} | jq ".Table.LatestStreamArn" | tr -d '"'`

POLICY_ID=`lower_case_random_string`

POLICY_NAME="dynamo-stream-`lower_case_random_string`"

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
