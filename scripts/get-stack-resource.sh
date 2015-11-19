#!/bin/bash

STACK_NAME=$1
STACK_RESOURCE=$2

if [ -z $STACK_NAME ];
then
    echo "Please specify a stack name."
    echo "Pro tip: you can get your stack name by running:"
    echo
    echo "   $ aws cloudformation list-stacks | jq '.StackSummaries[] | select(.StackStatus == \"UPDATE_COMPLETE\") | .StackName'"
    echo
    exit 1
fi

if [ -z $STACK_RESOURCE ];
then
    echo "Please specify a stack resource."
    echo
    exit 1
fi

JQ_FILTER="jq '.StackResources[] | select(.LogicalResourceId == \"$STACK_RESOURCE\") | .PhysicalResourceId'"

aws cloudformation describe-stack-resources --stack-name ${STACK_NAME} | eval $JQ_FILTER | tr -d '"'
