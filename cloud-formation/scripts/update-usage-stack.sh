#!/bin/bash

source ./get-usage-params.sh
source ./usage-pre-flight-checks.sh
source ./stack-name.sh usage
source ./upload-template.sh usage

echo "Updating stack $STACK_NAME"

aws cloudformation update-stack \
    --capabilities CAPABILITY_IAM \
    --template-url $TEMPLATE_URL \
    --stack-name $STACK_NAME \
    --parameters ParameterKey=ArtifactBucket,ParameterValue=$BUCKET ParameterKey=User,ParameterValue=$STACK_USER ParameterKey=ThrallQueueArn,ParameterValue=$STACK_QUEUE_ARN
