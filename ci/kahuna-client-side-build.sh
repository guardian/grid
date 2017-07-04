#!/usr/bin/env bash

pushd ../kahuna

echo "Building Kahuna client-side"

# clear old packages first
rm -rf node_modules
rm -rf public/jspm_packages

nvm install 4

./setup.sh || exit 1
./dist.sh

popd
