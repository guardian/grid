#!/usr/bin/env bash

SCRIPT_DIR=$(dirname ${0})

pushd ${SCRIPT_DIR}/../../image-counter-lambda

npm ci
npm run riffraff-artefact

popd
