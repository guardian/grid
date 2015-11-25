#/bin/bash

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

#Deploy
zip -r S3Watcher.zip * -X deploy.sh
aws s3 cp S3Watcher.zip s3://media-service-dist/media-service/$STAGE/S3Watcher.zip
