#!/bin/bash

STACK_NAME=$1

if [ -z ${STACK_NAME} ];
then
    echo "ERROR: No STACK_NAME specified."
    echo "Usage: $0 <STACK_NAME>"
    exit 1
fi

echo "Uploading config to stack $STACK_NAME"

# always use the media-service account
export AWS_PROFILE=media-service

lower_case_random_string() {
    echo `head -c 1024 /dev/urandom | md5 | tr '[:upper:]' '[:lower:]' | cut -c1-20`
}

get_stack_resource_physical_id() {
    echo `aws cloudformation list-stack-resources --stack-name $1 \
        | jq ".StackResourceSummaries[] | select(.LogicalResourceId == \"$2\") | .PhysicalResourceId" \
        | tr -d '"'`
}

CROPPER_KEY=cropper-`lower_case_random_string`
CONFIG_BUCKET=`get_stack_resource_physical_id ${STACK_NAME} ConfigBucket`
KEY_BUCKET=`get_stack_resource_physical_id ${STACK_NAME} KeyBucket`

# upload permissions.properties
echo 'Uploading empty permissions file'
aws s3 cp permissions.properties s3://${CONFIG_BUCKET}/permissions.properties

# upload an API key for Cropper to use
echo "Creating Cropper key $CROPPER_KEY"
echo Cropper > ${CROPPER_KEY}
aws s3 cp ${CROPPER_KEY} s3://${KEY_BUCKET}
rm ${CROPPER_KEY}

# clean up after ourselves
unset AWS_PROFILE
