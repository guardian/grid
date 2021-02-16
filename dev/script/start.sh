#!/usr/bin/env bash

set -e

green='\x1B[0;32m'
red='\x1B[0;31m'
plain='\x1B[0m' # No Color

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR=${DIR}/../..

export AWS_CBOR_DISABLE=true

LOCAL_AUTH=false
for arg in "$@"; do
  if [ "$arg" == "--debug" ]; then
    IS_DEBUG=true
    shift
  fi

  if [ "$arg" == "--ship-logs" ]; then
    export LOCAL_LOG_SHIPPING=true
    shift
  fi

  if [ "$arg" == "--with-local-auth" ]; then
    LOCAL_AUTH=true
    shift
  fi
done

isInstalled() {
  hash "$1" 2>/dev/null
}

hasCredentials() {
  if [[ $LOCAL_AUTH == true ]]; then
    return
  fi

  STATUS=$(aws sts get-caller-identity --profile media-service 2>&1 || true)
  if [[ ${STATUS} =~ (ExpiredToken) ]]; then
    echo -e "${red}Credentials for the media-service profile are expired. Please fetch new credentials and run this again.${plain}"
    exit 1
  elif [[ ${STATUS} =~ ("could not be found") ]]; then
    echo -e "${red}Credentials for the media-service profile are missing. Please ensure you have the right credentials.${plain}"
    exit 1
  fi
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

startDockerContainers() {
  docker-compose up -d
}

buildJs() {
  pushd "$ROOT_DIR/kahuna"
  npm install
  npm run build-dev
  popd
}

startPlayApps() {
  # pushd to find build.sbt and allow this script to be executed from any location (but ideally from the project root)
  echo "========================================================="
  echo "= Press cmd-C then cmd-D to stop"
  echo "========================================================="
  pushd "$ROOT_DIR"
  if [ "$IS_DEBUG" == true ] ; then
    sbt -jvm-debug 5005 runAll
  else
    sbt runAll
  fi
  popd
}

checkNodeVersion() {
  runningNodeVersion=$(node -v)
  requiredNodeVersion=$(cat "$ROOT_DIR/.nvmrc")

  if [ "$runningNodeVersion" != "$requiredNodeVersion" ]; then
    echo -e "${red}Using wrong version of Node. Required ${requiredNodeVersion}. Running ${runningNodeVersion}.${plain}"
    exit 1
  fi
}

checkForJavaHome() {
  echo "Checking JAVA_HOME"
  if [[ -z "$JAVA_HOME" ]]; then
    echo "  JAVA_HOME not set, please set it before continuing"
    echo "  This can be done by adding \"export JAVA_HOME=\$(/usr/libexec/java_home)\" to ~/.profile"
    exit 1
  else
    echo "  JAVA_HOME is set to $JAVA_HOME"
  fi
}

main() {
  checkForJavaHome
  hasCredentials
  checkRequirements
  checkNodeVersion
  startDockerContainers
  buildJs
  startPlayApps
}

main
