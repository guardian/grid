#!/bin/bash

source ./stack-name.sh
source ./upload-template.sh

echo "Updating stack $STACK_NAME"

aws cloudformation update-stack \
    --capabilities CAPABILITY_IAM \
    --template-url $TEMPLATE_URL \
    --stack-name $STACK_NAME
