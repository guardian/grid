#!/usr/bin/env bash

pushd ../s3watcher/lambda

npm install
npm run build

popd
