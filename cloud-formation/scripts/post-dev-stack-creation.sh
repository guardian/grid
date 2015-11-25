#!/bin/bash

source ./utils.sh
source ./stack-name.sh

CROPPER_KEY=cropper-`lower_case_random_string`
CONFIG_BUCKET=`get_stack_resource_physical_id $STACK_NAME ConfigBucket`
KEY_BUCKET=`get_stack_resource_physical_id $STACK_NAME KeyBucket`


echo 'Uploading empty permissions file'
aws s3 cp permissions.properties s3://$CONFIG_BUCKET/permissions.properties


echo "Creating cropper key $CROPPER_KEY"
echo Cropper > $CROPPER_KEY
aws s3 cp $CROPPER_KEY s3://$KEY_BUCKET
rm $CROPPER_KEY
