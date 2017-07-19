#!/bin/bash

cd "${0%/*}"
STACK_NAME=$1

if [ -z ${STACK_NAME} ];
then
    echo "ERROR: No STACK_NAME specified."
    echo "Usage: $0 <STACK_NAME>"
    exit 1
fi

echo "Deleting stack $STACK_NAME"

# always use the media-service account
export AWS_PROFILE=media-service

# empty all S3 buckets first
aws cloudformation list-stack-resources \
	--stack-name ${STACK_NAME} \
	| jq '.StackResourceSummaries[] | select(.ResourceType == "AWS::S3::Bucket").PhysicalResourceId' \
	| tr -d '"' \
	| while read BUCKET
do
	echo "Deleting contents of $BUCKET"
	aws s3 rm s3://${BUCKET} --recursive
done

aws cloudformation delete-stack \
	--stack-name ${STACK_NAME}

# clean up after ourselves
unset AWS_PROFILE
