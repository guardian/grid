#!/usr/bin/env bash

set -e

SCRIPT_DIR=$(dirname ${0})

NETWORK_NAME=grid-test-network
CONTAINER_NAME=grid-test-elasticsearch
LOCAL_PORT=9210

function cleanup() {
  echo '🧹 cleanup'
  unset ES6_USE_DOCKER
  unset ES6_TEST_URL
  docker stop $CONTAINER_NAME
  docker container rm $CONTAINER_NAME
  docker network rm $NETWORK_NAME
}

trap cleanup EXIT

launchElasticsearch() {
  docker network create $NETWORK_NAME

  docker create \
    --name $CONTAINER_NAME \
    --network $NETWORK_NAME \
    -e "discovery.type=single-node" \
    --health-cmd "curl localhost:9200/_cluster/health" \
    -p $LOCAL_PORT:9200 \
    elasticsearch:6.5.4

  docker start $CONTAINER_NAME
}

ensureElasticsearchIsHealthy() {
  HEALTHCHECK=$(docker inspect --format="{{.State.Health.Status}}" $CONTAINER_NAME)

  until [[ $HEALTHCHECK == "healthy" ]]; do
    echo "elasticsearch container health status: $HEALTHCHECK"
    HEALTHCHECK=$(docker inspect --format="{{.State.Health.Status}}" $CONTAINER_NAME)
    sleep 10
  done
}

setupNvm() {
    export NVM_DIR="$HOME/.nvm"
    [[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"  # This loads nvm

    nvm install
    nvm use
}

buildJs() {
  setupNvm
  pushd ${SCRIPT_DIR}/../../kahuna

  # clear old packages first
  rm -rf node_modules

  npm install
  npm run undist
  npm test
  npm run dist

  popd
}

buildSbt() {
  export ES6_USE_DOCKER=false
  export ES6_TEST_URL=http://localhost:$LOCAL_PORT
  ensureElasticsearchIsHealthy
  sbt clean test riffRaffUpload
}

launchElasticsearch
buildJs
buildSbt
