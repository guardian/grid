#!/bin/bash

STACK_RESOURCE=$1
STACK_NAME=$2


if [ -z ${STACK_RESOURCE} ];
then
    echo "Please specify a stack resource."
    exit 1
fi

if [ -z ${STACK_NAME} ];
then
    STACK_NAME=media-service-DEV
fi

JQ_FILTER="jq '.StackResources[] | select(.LogicalResourceId == \"$STACK_RESOURCE\") | .PhysicalResourceId'"

AWS_REGION="${AWS_REGION:-eu-west-1}" aws cloudformation describe-stack-resources \
    --stack-name ${STACK_NAME} \
    --profile media-service \
    | eval ${JQ_FILTER} \
    | tr -d '"'
