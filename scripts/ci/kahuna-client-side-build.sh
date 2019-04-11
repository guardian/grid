#!/usr/bin/env bash

SCRIPT_DIR=$(dirname ${0})

NODE_VERSION="6.2.1"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm

nvm use ${NODE_VERSION}

pushd ${SCRIPT_DIR}/../../kahuna

echo "Building Kahuna client-side"

# clear old packages first
rm -rf node_modules
rm -rf public/jspm_packages

./setup.sh || exit 1
./dist.sh || exit 1

popd
