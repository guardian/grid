#/bin/bash

STAGE=$1
BUCKET=$2
PROJECT=$3

if [ -z $STAGE ];
then
    echo "Please specify a stage.";
    exit 1
fi

if [ -z $BUCKET ];
then
    echo "Please specify a destination bucket.";
    exit 1
fi

if [ -z $PROJECT ];
then
    echo "Please specify a project.";
    exit 1
fi


cd $PROJECT

npm install

zip -r ${PROJECT}.zip *
aws s3 cp ${PROJECT}.zip s3://$BUCKET/media-service/$STAGE/${PROJECT}.zip
rm ${PROJECT}.zip
