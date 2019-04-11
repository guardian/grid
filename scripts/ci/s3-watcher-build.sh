#!/usr/bin/env bash

SCRIPT_DIR=$(dirname ${0})

NODE_VERSION="6.2.1"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm

nvm use ${NODE_VERSION}

pushd $SCRIPT_DIR/../../s3watcher/lambda

npm install
npm run build

popd
