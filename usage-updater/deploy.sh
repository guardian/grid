#!/bin/bash

STAGE=$1

if [ -z $STAGE ];
then
    echo "No stage specified, deploying to TEST."
    STAGE=TEST
fi

mkdir -p target/build
rsync -a --progress . target/build --exclude target/build
cd target/build

npm install

#Extract config per stage from S3
aws s3 cp s3://media-service-dist/lambda-config/$STAGE/usage-updater/Config.js lib/Config.js

#Deploy
zip -r usage-updater.zip * -X deploy.sh
aws s3 cp usage-updater.zip s3://media-service-dist/media-service/$STAGE/usage-updater.zip
