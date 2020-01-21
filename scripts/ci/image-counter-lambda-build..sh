#!/usr/bin/env bash

SCRIPT_DIR=$(dirname ${0})

NODE_VERSION="12"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm

nvm use ${NODE_VERSION}

pushd ${SCRIPT_DIR}/../../image-counter-lambda

npm install
npm run riffraff-artefact

popd