#!/bin/bash

source ./stack-name.sh
source ./pre-flight-checks.sh
source ./get-or-create-artifact-bucket.sh

echo "Creating stack $STACK_NAME"

aws cloudformation create-stack \
    --capabilities CAPABILITY_IAM \
    --template-body file://../dev-template.json \
    --stack-name ${STACK_NAME} \
    --parameters ParameterKey=ArtifactBucket,ParameterValue=${BUCKET}
