#!/usr/bin/env bash

source ./stack-name.sh

USAGE_LAMBDA=`aws s3api list-objects --bucket media-service-dist --prefix media-service/DEV/$STACK_NAME/usage-updater.zip | jq '.Contents | length'`

if [ -z "$USAGE_LAMBDA" ];
then
    echo '**** FAILED ****'
    echo 'Upload usage lambda first!'
    exit 1
fi
