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

cat deploy.json \
    | jq ".packages.lambda.data.functions.TEST.name |= \"$TEST_FUNC_NAME\" | .packages.lambda.data.functions.PROD.name |= \"$PROD_FUNC_NAME\"" \
    > lambda/deploy.json

export VERBOSE=true

pushd lambda

npm install

ARTEFACT_PATH="$WORKSPACE/s3watcher/lambda" npm run build
