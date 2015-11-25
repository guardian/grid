#!/usr/bin/env bash

source ./utils.sh

BUCKET=`aws s3api list-buckets | jq '.Buckets[] | select(.Name | startswith("media-service-dist")) | .Name' | tr -d '"'`

if [ -z "$BUCKET" ];
then
    BUCKET="media-service-dist-`lower_case_random_string`"
    echo "Creating bucket $BUCKET"
    aws s3 mb "s3://$BUCKET"
fi

export BUCKET=$BUCKET
