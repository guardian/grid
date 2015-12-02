#!/bin/bash

set -e

get_function_name() {
    echo $(aws cloudformation list-stack-resources --stack-name $1 \
        | jq ".StackResourceSummaries[] | select(.LogicalResourceId == \"S3WatcherLamdbaFunction\") | .PhysicalResourceId" \
        | tr -d '"')
}

TEST_FUNC_NAME=$(get_function_name media-service-TEST)
PROD_FUNC_NAME=$(get_function_name media-service-PROD)

cd lambda
npm install
zip -r S3Watcher.zip *
cd ..

[ -d target ] && rm -rf target
mkdir -p target/packages/lambda
mv lambda/S3Watcher.zip target/packages/lambda/lambda.zip

cat deploy.json \
    | jq ".packages.lambda.functions.TEST.name |= \"$TEST_FUNC_NAME\" | .packages.lambda.functions.PROD.name |= \"$PROD_FUNC_NAME\"" \
    > target/deploy.json

cd target
zip -r artifacts.zip *

echo "##teamcity[publishArtifacts '$(pwd)/artifacts.zip => .']"
