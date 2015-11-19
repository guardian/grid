#!/bin/bash

STACK_NAME="media-service-DEV-`aws iam get-user | jq '.User.UserName' | tr -d '"'`"

echo "Updating stack $STACK_NAME"

aws cloudformation update-stack --stack-name ${STACK_NAME} --template-body file://dev-template.json --capabilities CAPABILITY_IAM
