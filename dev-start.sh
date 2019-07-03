#!/usr/bin/env bash

set -e

green='\x1B[0;32m'
red='\x1B[0;31m'
plain='\x1B[0m' # No Color

IS_DEBUG=false
for arg in "$@"
do
  if [ "$arg" == "--debug" ]; then
    IS_DEBUG=true
    shift
  fi
done

startDockerContainers() {
  docker-compose up -d
}

buildJs() {
  pushd kahuna
  npm run build-dev
  popd
}

startPlayApps() {
  if [[ "$IS_DEBUG" = true ]] ; then
    sbt -jvm-debug 5005 runAll
  else
    sbt runAll
  fi
}

setNodeVersion() {
  if [[ ! -f ${NVM_DIR}/nvm.sh ]]; then
    node_version=`cat .nvmrc`
    echo -e "${red}nvm not found ${plain} NVM is required to run this project"
    echo -e "Install it from https://github.com/creationix/nvm#installation"
    exit 1
  else
    source "$NVM_DIR/nvm.sh"
    nvm use
  fi
}

main() {
  setNodeVersion
  startDockerContainers
  buildJs
  startPlayApps
}

main
