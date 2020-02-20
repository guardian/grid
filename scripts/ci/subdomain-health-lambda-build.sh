#!/usr/bin/env bash

apt-get update
apt-get install zip

set -ex

SCRIPT_DIR=$(dirname ${0})

pushd ${SCRIPT_DIR}/../../subdomain-health-lambda

npm ci
npm test
npm run riffraff-artefact

popd
