#!/usr/bin/env bash

set -ex

SCRIPT_DIR=$(dirname ${0})

pushd ${SCRIPT_DIR}/../../image-counter-lambda

npm ci
npm test
npm run deploy

popd
