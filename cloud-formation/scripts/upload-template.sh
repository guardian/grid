#!/usr/bin/env bash

source ./stack-name.sh
source ./get-or-create-artifact-bucket.sh

TEMPLATE_KEY="cloudformation/DEV/$STACK_NAME.template"

echo "Uploading template to s3://$BUCKET/$TEMPLATE_KEY"
aws s3 cp ../dev-template.json "s3://$BUCKET/$TEMPLATE_KEY"

export TEMPLATE_URL="https://$BUCKET.s3.amazonaws.com/$TEMPLATE_KEY"
