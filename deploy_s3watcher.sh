#/bin/bash

STAGE=$1
BUCKET=$2

if [ -z $STAGE ];
then
    echo "Please specify a stage.";
    exit 1
fi

if [ -z $BUCKET ];
then
    echo "Please specify a destination bucket";
    exit 1
fi

cd s3watcher

npm install

zip -r S3Watcher.zip *
aws s3 cp S3Watcher.zip s3://$BUCKET/media-service/$STAGE/S3Watcher.zip
rm S3Watcher.zip
