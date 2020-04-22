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

    if [ "$arg" == "--ship-logs" ]; then
        export LOCAL_LOG_SHIPPING=true
        shift
    fi
done

isInstalled() {
  hash "$1" 2>/dev/null
}

hasCredentials() {
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

setupImgops() {
    if [ ! -f ./dev/imgops/nginx.conf ]; then
        bucket=`bash get-stack-resource.sh ImageBucket`
        if [ -z "$bucket" ]; then
            echo -e "${red}[CANNOT GET ImageBucket] This may be because your default region for the media-service profile has not been set.${plain}"
            exit 1
        fi

        sed -e 's/{{BUCKET}}/'${bucket}'/g' ./dev/imgops/nginx.conf.template > ./dev/imgops/nginx.conf
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

checkNodeVersion() {
  runningNodeVersion=$(node -v)
  requiredNodeVersion=$(cat .nvmrc)

  if [ "$runningNodeVersion" != "$requiredNodeVersion" ]; then
    echo -e "${red}Using wrong version of Node. Required ${requiredNodeVersion}. Running ${runningNodeVersion}.${plain}"
    exit 1
  fi
}

setupLocalKinesis() {
  echo "Waiting localstack kinesis to launch on 4566..."
  while ! curl -s http://localhost:4566 >/dev/null; do
    sleep 1 # wait for 1 second before check again
  done
  echo "localstack kinesis launched"

  # java sdk use CBOR protocol
  # which does not work with localstack kinesis which use kinesislite
  export AWS_CBOR_DISABLE=true
  export AWS_PAGER=""

  streams=(
    'media-service-DEV-thrall'
    'media-service-DEV-thrall-low-priority'
  )

  for stream_name in "${streams[@]}"; do
    stream_count=$(aws --profile media-service --region=eu-west-1 --endpoint-url=http://localhost:4566 kinesis list-streams | jq -r '.StreamNames[]' | grep -c "${stream_name}" || true)
    if [ "$stream_count" -eq 0 ]; then
      echo "creating local kinesis stream ${stream_name}"
      aws --profile media-service --region=eu-west-1 --endpoint-url=http://localhost:4566 kinesis create-stream --shard-count 1 --stream-name "${stream_name}"
    fi
  done
}

main() {
    hasCredentials
    checkRequirements
    checkNodeVersion
    setupImgops
    downloadApplicationConfig
    startDockerContainers
    setupLocalKinesis
    buildJs
    startPlayApps
}

main
