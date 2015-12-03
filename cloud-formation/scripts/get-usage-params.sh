#!/bin/bash

source ./stack-name.sh

aws cloudformation list-stack-resources --stack-name $STACK_NAME &> /dev/null

if [ $? -ne 0 ];
then
    echo 'Create core stack first'
    exit 1
fi

STACK_QUEUE_URL=`aws cloudformation list-stack-resources --stack-name $STACK_NAME | jq '.StackResourceSummaries[] | select(.LogicalResourceId == "Queue") | .PhysicalResourceId' | tr -d '"'`

export STACK_QUEUE_ARN=`aws sqs get-queue-attributes --queue-url $STACK_QUEUE_URL --attribute-names QueueArn | jq '.Attributes.QueueArn'`

export STACK_USER=`aws cloudformation list-stack-resources --stack-name $STACK_NAME | jq '.StackResourceSummaries[] | select(.LogicalResourceId == "User") | .PhysicalResourceId' | tr -d '"'`
