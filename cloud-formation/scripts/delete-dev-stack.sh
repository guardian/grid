#!/bin/bash

source ./stack-name.sh

# empty all S3 buckets first
aws cloudformation list-stack-resources \
	--stack-name $STACK_NAME \
	| jq '.StackResourceSummaries[] | select(.ResourceType == "AWS::S3::Bucket").PhysicalResourceId' \
	| tr -d '"' \
	| while read BUCKET
do
	echo "Deleting contents of $BUCKET"
	aws s3 rm s3://$BUCKET --recursive
done

aws cloudformation delete-stack \
	--stack-name $STACK_NAME

echo 'Done'
