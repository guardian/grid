#!/usr/bin/env bash

BUCKET=`aws s3api list-buckets | jq '.Buckets[] | select(.Name | startswith("media-service-dist")) | .Name' | tr -d '"'`

if [ -z "$BUCKET" ];
then
    BUCKET="media-service-dist-`pwgen -1 --no-capitalize 20`"
    echo "Creating bucket $BUCKET"
    aws s3 mb "s3://$BUCKET"
fi

export BUCKET=$BUCKET
