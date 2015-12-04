#!/bin/bash

set -e

if [ -z $TEST_FUNC_NAME ]; then
    echo 'TEST_FUNC_NAME is unset';
    exit 1
fi

if [ -z $PROD_FUNC_NAME ]; then
    echo 'PROD_FUNC_NAME is unset';
    exit 1
fi

cd lambda
npm install

# TODO get or create config.json

zip -r lambda.zip *
cd ..

[ -d target ] && rm -rf target
mkdir -p target/packages/lambda
mv lambda/lambda.zip target/packages/lambda/lambda.zip

cat deploy.json \
    | jq ".packages.lambda.data.functions.TEST.name |= \"$TEST_FUNC_NAME\" | .packages.lambda.data.functions.PROD.name |= \"$PROD_FUNC_NAME\"" \
    > target/deploy.json

cd target
zip -r artifacts.zip *

echo "##teamcity[publishArtifacts '$(pwd)/artifacts.zip => .']"
