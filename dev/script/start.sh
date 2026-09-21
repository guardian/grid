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
  if [ "$arg" == "--no-auth" ]; then
    LOCAL_AUTH=true
    shift
  fi
  if [ "$arg" == "--use-TEST" ]; then
    USE_TEST=true
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

getNewestElasticSearchInstanceOnTest() {
  aws ec2 describe-instances \
    --filters \
        "Name=tag:App,Values=elasticsearch-data" \
        "Name=tag:Stack,Values=media-service" \
        "Name=tag:Stage,Values=TEST" \
        "Name=instance-state-name,Values=running" \
    --query "Reservations[].Instances[] | sort_by(@, &LaunchTime)[-1].InstanceId" \
    --output text \
    --region eu-west-1 \
    --profile media-service
}

openTunnelToElasticsearchTest() {
  # Backgrounded (&) as this command blocks in the foreground for the
  # lifetime of the tunnel and would otherwise hang the rest of the script.
  aws ssm start-session \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "{\"host\":[\"localhost\"],\"portNumber\":[\"9200\"],\"localPortNumber\":[\"9200\"]}" \
    --target "$(getNewestElasticSearchInstanceOnTest)" \
    --region eu-west-1 \
    --profile media-service > /tmp/grid-es-tunnel.log 2>&1 &

  # Give the tunnel a moment to establish before docker/sbt try to use it
  for i in {1..10}; do
    if nc -z localhost 9200 2>/dev/null; then
      return 0
    fi
    sleep 1
  done

  echo -e "${red}TUNNEL DID NOT ESTABLISH TO TEST ELASTICSEARCH (on port 9200) within 10s - check /tmp/grid-es-tunnel.log${plain}"
  return 1
}

startDockerContainers() {
  EXISTING_TUNNELS=$(ps -ef | grep session-manager-plugin | grep 9200 | grep -v grep || true)
  if [[ $USE_TEST == true ]]; then
    if (docker stats --no-stream &> /dev/null); then
      docker compose down
    fi
    if [[ -n $EXISTING_TUNNELS ]]; then
      echo "RE-USING EXISTING TUNNEL TO TEST ELASTICSEARCH (on port 9200)"
    else
      if openTunnelToElasticsearchTest; then
        echo "TUNNEL ESTABLISHED TO TEST ELASTICSEARCH (on port 9200)"
      fi
    fi
  else
    if [[ $EXISTING_TUNNELS ]]; then
      echo "KILLING EXISTING TUNNEL TO TEST ELASTICSEARCH (on port 9200)"
      # shellcheck disable=SC2046
      kill $(echo $EXISTING_TUNNELS | awk '{print $2}')
    fi
    docker compose up -d
  fi

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
    SBT_OPTS="-jvm-debug 5005"
  fi
  if [[ $USE_TEST == true ]]; then

    EXTRA_CONFIG_DIR=/tmp/grid-config-TEST
    mkdir -p $EXTRA_CONFIG_DIR

    aws s3 cp s3://grid-conf/TEST/media-api/media-api.conf $EXTRA_CONFIG_DIR/ --profile media-service
    aws s3 cp s3://grid-conf/TEST/kahuna/kahuna.conf $EXTRA_CONFIG_DIR/ --profile media-service

    SBT_OPTS="$SBT_OPTS -J-Daws.local.endpoint= -J-DextraConfigDir=$EXTRA_CONFIG_DIR -J-Ddomain.root-override=test.dev-gutools.co.uk"

    sbt $SBT_OPTS runMinimal
  else
    sbt $SBT_OPTS runAll
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
