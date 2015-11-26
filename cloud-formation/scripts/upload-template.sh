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

TEMPLATE_KEY="cloudformation/DEV/$STACK_NAME.template"

echo "Uploading template to s3://$BUCKET/$TEMPLATE_KEY"
aws s3 cp $TEMPLATE_FILE "s3://$BUCKET/$TEMPLATE_KEY"

export TEMPLATE_URL="https://$BUCKET.s3.amazonaws.com/$TEMPLATE_KEY"
