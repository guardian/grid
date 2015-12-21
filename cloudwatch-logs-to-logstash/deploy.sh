#!/bin/bash

set -e

if [ $# -lt 1 ]
then
    echo "usage: deploy.sh <ROLE_ARN> <STREAM_NAME>"
    exit 1
fi

ROLE_ARN=$1
STREAM_NAME=$2

cd lambda

npm install
npm test

echo 'Creating lambda artifact'
zip -r lambda.zip *

cd ..

[ -d target ] && rm -rf target
mkdir -p target/packages/lambda
mv lambda/lambda.zip target/packages/lambda/lambda.zip

cd target

echo 'Adding config file to lambda artifact'
cat ../config-template.json \
    | jq ".roleArn |= \"$ROLE_ARN\" | .streamName |= \"$STREAM_NAME\"" \
    > config.json

zip packages/lambda/lambda.zip config.json

rm config.json

echo 'Done. Please update the lambda function code now!'
