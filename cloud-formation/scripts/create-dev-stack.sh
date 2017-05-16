#!/bin/bash

STACK_NAME=$1

if [ -z ${STACK_NAME} ];
then
    echo "ERROR: No STACK_NAME specified."
    echo "Usage: $0 <STACK_NAME>"
    exit 1
fi

echo "Creating stack $STACK_NAME"

# always use the media-service account
export AWS_PROFILE=media-service

aws cloudformation create-stack \
    --capabilities CAPABILITY_IAM \
    --stack-name ${STACK_NAME} \
    --template-body file://$PWD/../dev-template.json \
    --region eu-west-1

# clean up after ourselves
unset AWS_PROFILE
