#!/usr/bin/env bash

if [ $# -lt 1 ];
then
    TEMPLATE_FILE='../dev-template.json'
else
    SUB_STACK=$1
    TEMPLATE_FILE="../$SUB_STACK-template.json"
fi

source ./stack-name.sh $SUB_STACK
source ./get-or-create-artifact-bucket.sh

REGION=`aws configure get region`
TEMPLATE_KEY="$BUCKET/cloudformation/DEV/$STACK_NAME.template"

echo "Uploading template to s3://$TEMPLATE_KEY"
aws s3 cp $TEMPLATE_FILE "s3://$TEMPLATE_KEY"

export TEMPLATE_URL="https://s3-$REGION.amazonaws.com/$TEMPLATE_KEY"
