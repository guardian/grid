#!/bin/bash

source ./stack-name.sh
source ./upload-template.sh

echo "Creating stack $STACK_NAME"

aws --region "eu-west-1" cloudformation create-stack --capabilities CAPABILITY_IAM --template-url $TEMPLATE_URL --stack-name $STACK_NAME
