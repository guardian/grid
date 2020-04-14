#!/usr/bin/env bash

set -e

SCRIPT_DIR=$(dirname ${0})

setupNvm() {
    export NVM_DIR="$HOME/.nvm"
    [[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"  # This loads nvm

    nvm install
    nvm use
}

buildJs() {
  echo "##teamcity[compilationStarted compiler='webpack']"

  setupNvm
  pushd ${SCRIPT_DIR}/../../kahuna

  # clear old packages first
  rm -rf node_modules

  npm install
  npm run undist
  npm test
  npm run dist
  echo "##teamcity[compilationFinished compiler='webpack']"
  popd
}

buildSbt() {
  echo "##teamcity[compilationStarted compiler='sbt']"
  sbt clean test riffRaffUpload
  echo "##teamcity[compilationFinished compiler='sbt']"

}

buildJs
buildSbt
