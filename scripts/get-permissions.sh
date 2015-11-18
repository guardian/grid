#!/bin/bash

STACK_NAME=$1

if [ -z ${STACK_NAME} ];
then
    echo "Please specify a stack name."
    echo "Pro tip: you can get your stack name by running:"
    echo
    echo "   $ aws cloudformation list-stacks | jq '.StackSummaries[] | select(.StackStatus == \"UPDATE_COMPLETE\") | .StackName'"
    echo
    exit 1
fi

BUCKET=`aws cloudformation describe-stack-resources --stack-name ${STACK_NAME} \
    | jq '.StackResources[] | select(.LogicalResourceId == "ConfigBucket") | .PhysicalResourceId' \
    | tr -d '"'`

echo "Downloading permissions file to /tmp/permissions.properties. Edit it then replace it by:"
echo
echo "  $ aws s3 cp /tmp/permissions.properties s3://${BUCKET}/permissions.properties"
echo

aws s3 cp "s3://${BUCKET}/permissions.properties" /tmp/permissions.properties
