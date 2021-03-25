#!/usr/bin/env bash

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR=${DIR}/../..

# load values from .env into environment variables
# see https://stackoverflow.com/a/30969768/3868241
set -o allexport
# shellcheck source=../.env
source "$ROOT_DIR/dev/.env"
set +o allexport

# ---- START static variables that shouldn't be changed
export AWS_PAGER=""
export AWS_CBOR_DISABLE=true

LOCALSTACK_ENDPOINT=http://localhost:4566

CORE_STACK_FILE="$ROOT_DIR/dev/cloudformation/grid-dev-core.yml"
CORE_STACK_FILENAME=$(basename "$CORE_STACK_FILE")

AUTH_STACK_FILE="$ROOT_DIR/dev/cloudformation/grid-dev-auth.yml"
AUTH_STACK_FILENAME=$(basename "$AUTH_STACK_FILE")
# ---- END

LOCAL_AUTH=false
for arg in "$@"; do
  if [ "$arg" == "--clean" ]; then
    CLEAN=true
    shift
  fi
  if [ "$arg" == "--with-local-auth" ]; then
    LOCAL_AUTH=true
    shift
  fi
done

clean() {
  if [[ $CLEAN != true ]]; then
    return
  fi

  echo "removing all previous local infrastructure"

  rm -rf "$ROOT_DIR/dev/.localstack"
  echo "  removed historical localstack data"

  docker-compose down -v
  echo "  removed docker containers"

  docker-compose build
  echo "  rebuilt docker containers"
}

startDocker() {
  docker-compose up -d

  echo "waiting for localstack to launch on $LOCALSTACK_ENDPOINT"
  while ! curl -s $LOCALSTACK_ENDPOINT >/dev/null; do
    echo "  localstack not ready yet"
    sleep 1 # wait for 1 second before check again
  done
  echo "  localstack is now ready"
}

setupDevNginx() {
  imageOriginBucket=$(getStackResource "$CORE_STACK_NAME" ImageOriginBucket)
  imagesBucket=$(getStackResource "$CORE_STACK_NAME" ImageBucket)

  target="$ROOT_DIR/dev/nginx-mappings.yml"

  sed -e "s/@IMAGE-ORIGIN-BUCKET/$imageOriginBucket/g" \
    -e "s/@IMAGE-BUCKET/$imagesBucket/g" \
    -e "s/@DOMAIN_ROOT/$DOMAIN/g" \
    "$ROOT_DIR/dev/nginx-mappings.yml.template" > "$target"

  dev-nginx setup-app "$target"
}

setupPermissionConfiguration() {
  if [[ $LOCAL_AUTH != true ]]; then
    return
  fi

  echo "setting up permissions configuration for local auth"

  target="$ROOT_DIR/common-lib/src/main/resources/application.conf"

  guardianProviderClassName="com.gu.mediaservice.lib.guardian.auth.PermissionsAuthorisationProvider"

  localProviderClassName="com.gu.mediaservice.lib.auth.provider.LocalAuthorisationProvider"

  sed -i -- "s/$guardianProviderClassName/$localProviderClassName/g" "$target"

}

setupAuthenticationConfiguration() {
  if [[ $LOCAL_AUTH != true ]]; then
    return
  fi

  echo "setting up authentication configuration for local auth"

  target="$ROOT_DIR/common-lib/src/main/resources/application.conf"

  guardianProviderClassName="com.gu.mediaservice.lib.guardian.auth.PandaAuthenticationProvider"

  localProviderClassName="com.gu.mediaservice.lib.auth.provider.LocalAuthenticationProvider"

  sed -i -- "s/$guardianProviderClassName/$localProviderClassName/g" "$target"

}


setupPhotographersConfiguration() {
  echo "setting up photographers configuration"

  configBucket=$(getStackResource "$CORE_STACK_NAME" ConfigBucket)

  target="$ROOT_DIR/dev/config/photographers.json"

  aws s3 cp "$target" \
    "s3://$configBucket/" \
    --endpoint-url $LOCALSTACK_ENDPOINT

  echo "  uploaded file to $configBucket"
}

setupUsageRightsConfiguration() {
  echo "setting up usage rights configuration"

  configBucket=$(getStackResource "$CORE_STACK_NAME" ConfigBucket)

  target="$ROOT_DIR/dev/config/usage_rights.json"

  aws s3 cp "$target" \
    "s3://$configBucket/" \
    --endpoint-url $LOCALSTACK_ENDPOINT

  echo "  uploaded file to $configBucket"
}


getStackResource() {
  stackName=$1
  resourceName=$2

  stackResources=$(
    aws cloudformation describe-stack-resources \
      --stack-name "$stackName" \
      --endpoint-url $LOCALSTACK_ENDPOINT
  )

  resource=$(
    echo "$stackResources" \
    | jq -r ".StackResources[] | select(.LogicalResourceId == \"$resourceName\") | .PhysicalResourceId"
  )

  echo "$resource"
}

createCoreStack() {
  echo "creating local core cloudformation stack"
  set -x
  stackNames=$(
    aws cloudformation list-stacks \
      --endpoint-url http://localhost:4566 | \
      jq -r '.StackSummaries[].StackName'
  )
  if echo ${stackNames} | grep -q '^grid-dev-core$'; then
    aws cloudformation update-stack \
      --stack-name "$CORE_STACK_NAME" \
      --template-body "file://$CORE_STACK_FILE" \
      --endpoint-url $LOCALSTACK_ENDPOINT > /dev/null
    echo "  updated stack $CORE_STACK_NAME using $CORE_STACK_FILENAME"
  else
    aws cloudformation create-stack \
      --stack-name "$CORE_STACK_NAME" \
      --template-body "file://$CORE_STACK_FILE" \
      --endpoint-url $LOCALSTACK_ENDPOINT > /dev/null
    echo "  created stack $CORE_STACK_NAME using $CORE_STACK_FILENAME"
  fi
  set +x

  # TODO - this should wait until the stack operation has completed
}

generateConfig() {
  CONF_HOME="${HOME}/.grid"
  mkdir -p ${CONF_HOME}
  echo "generating configuration files"
  pushd "$ROOT_DIR/dev/script/generate-config"
  npm install
  npm run generate-config
  popd
  echo "  configuration files created in ${CONF_HOME}"
}

uploadApiKey() {
  echo "uploading an api key"
  keyBucket=$(getStackResource "$CORE_STACK_NAME" KeyBucket)

  target="/tmp/$API_KEY"

  echo "DEV Key" > "$target"

  aws s3 cp "$target" \
    "s3://$keyBucket/" \
    --endpoint-url $LOCALSTACK_ENDPOINT

  rm "$target"
  echo "  uploaded"
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
  clean
  startDocker
  createCoreStack

  if [[ $LOCAL_AUTH == true ]]; then
    setupPermissionConfiguration
    setupAuthenticationConfiguration
  fi

  setupPhotographersConfiguration
  setupUsageRightsConfiguration
  setupDevNginx
  generateConfig
  uploadApiKey
  echo "Setup complete. You're now able to start Grid!"
}

main
