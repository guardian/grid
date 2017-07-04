#!/usr/bin/env bash

pushd ../s3watcher/lambda

nvm install 6

npm install
npm run build

popd
