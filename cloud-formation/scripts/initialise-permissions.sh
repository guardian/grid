#!/bin/bash

source ./stack-name.sh

CONFIG_BUCKET=`aws cloudformation list-stack-resources --stack-name $STACK_NAME | jq '.StackResourceSummaries[] | select(.LogicalResourceId == "ConfigBucket") | .PhysicalResourceId' | tr -d '"'`

aws s3 cp permissions.properties s3://$CONFIG_BUCKET/permissions.properties
