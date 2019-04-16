#!/usr/bin/env bash

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

isInstalled() {
  hash "$1" 2>/dev/null
}

checkRequirement() {
    if ! isInstalled $1; then
        echo -e "${red}[MISSING DEPENDENCY] $1 not found. Please install $1${plain}"
        exit 1
    fi
}

checkRequirements() {
    # server side
    checkRequirement java
    checkRequirement sbt

    # client side
    checkRequirement npm

    # elasticsearch and imgops (image resizer)
    checkRequirement docker

    # image libraries
    checkRequirement gm # GraphicsMagick
    checkRequirement magick #ImageMagick
    checkRequirement convert
    checkRequirement pngquant
    checkRequirement exiftool

    # other
    checkRequirement nginx
    checkRequirement jq
    checkRequirement aws
}

setupImgops() {
    if [ ! -f ./imgops/dev/nginx.conf ]; then
        bucket=`bash get-stack-resource.sh ImageBucket`
        if [ -z "$bucket" ]; then
            echo -e "${red}[CANNOT GET ImageBucket] This may be because your default region for the media-service profile has not been set.${plain}"
            exit 1
        fi

        sed -e 's/{{BUCKET}}/'${bucket}'/g' ./imgops/dev/nginx.conf.template > ./imgops/dev/nginx.conf
    fi
}

startDockerContainers() {
    docker-compose up -d
}

buildJs() {
  pushd kahuna
  npm install
  npm run build-dev
  popd
}

startPlayApps() {
    if [ "$IS_DEBUG" = true ] ; then
        sbt -jvm-debug 5005 runAll
    else
        sbt runAll
    fi
}

# We use auth.properties as a proxy for whether all the configuration files have been downloaded given the implementation of `fetchConfig.sh`.
downloadApplicationConfig() {
    if [ ! -f /etc/gu/auth.properties ]; then
        bash ./fetch-config.sh
    fi
}

fileExists() {
  test -e "$1"
}

changeNodeVersion() {
  if ! fileExists "$NVM_DIR/nvm.sh"; then
    node_version=`cat .nvmrc`
    echo -e "${red}nvm not found ${plain} NVM is required to run this project"
    echo -e "Install it from https://github.com/creationix/nvm#installation"
  else
    source "$NVM_DIR/nvm.sh"
    nvm install
  fi
}

main() {
    checkRequirements
    changeNodeVersion
    setupImgops
    downloadApplicationConfig
    startDockerContainers
    buildJs
    startPlayApps
}

main
