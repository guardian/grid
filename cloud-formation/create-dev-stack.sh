#!/bin/bash

STACK_NAME="media-service-DEV-`aws iam get-user | jq '.User.UserName' | tr -d '"'`"

echo "Creating stack $STACK_NAME"

aws cloudformation create-stack --stack-name ${STACK_NAME} --template-body file://dev-template.json --capabilities CAPABILITY_IAM
