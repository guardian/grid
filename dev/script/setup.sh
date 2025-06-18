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
NO_AUTH=false
for arg in "$@"; do
  if [ "$arg" == "--clean" ]; then
    CLEAN=true
    shift
  fi
  if [ "$arg" == "--with-local-auth" ]; then
    LOCAL_AUTH=true
    shift
  fi
  if [ "$arg" == "--no-auth" ]; then
    LOCAL_AUTH=true
    NO_AUTH=true
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

  docker compose down -v
  echo "  removed docker containers"

  docker compose build
  echo "  rebuilt docker containers"
}

startDocker() {
  docker compose up -d

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

setupPanDomainConfiguration() {
  if [[ $LOCAL_AUTH != true ]]; then
    return
  fi

  echo "setting up pan domain authentication configuration for local auth"

  panDomainBucket=$(getStackResource "$AUTH_STACK_NAME" PanDomainBucket)

  PANDA_COOKIE_NAME=gutoolsAuth-assym

  OUTPUT_DIR=/tmp

  PANDA_PRIVATE_SETTINGS_FILE="$OUTPUT_DIR/$DOMAIN.settings"
  PANDA_PUBLIC_SETTINGS_FILE="$OUTPUT_DIR/$DOMAIN.settings.public"

  PRIVATE_KEY_FILE=$(mktemp "$OUTPUT_DIR/private-key.XXXXXX")
  PUBLIC_KEY_FILE=$(mktemp "$OUTPUT_DIR/public-key.XXXXXX")

  openssl genrsa -out "$PRIVATE_KEY_FILE" 4096
  openssl rsa -pubout -in "$PRIVATE_KEY_FILE" -out "$PUBLIC_KEY_FILE"

  privateKey=$(sed -e '1d' -e '$d' < "$PRIVATE_KEY_FILE" | tr -d '\n')
  publicKey=$(sed -e '1d' -e '$d'  < "$PUBLIC_KEY_FILE" | tr -d '\n')

  privateSettings=$(cat <<END
privateKey=${privateKey}
publicKey=${publicKey}
cookieName=${PANDA_COOKIE_NAME}
clientId=${OIDC_CLIENT_ID}
clientSecret=${OIDC_CLIENT_SECRET}
discoveryDocumentUrl=http://localhost:9014/.well-known/openid-configuration
END
)

  publicSettings=$(cat <<END
publicKey=${publicKey}
END
)

  echo "$privateSettings" > "$PANDA_PRIVATE_SETTINGS_FILE"
  echo "$publicSettings" > "$PANDA_PUBLIC_SETTINGS_FILE"

  filesToUpload=(
    "$PANDA_PRIVATE_SETTINGS_FILE"
    "$PANDA_PUBLIC_SETTINGS_FILE"
  )

  for file in "${filesToUpload[@]}"; do
    aws s3 cp "$file" "s3://$panDomainBucket/" --endpoint-url $LOCALSTACK_ENDPOINT
    echo "  uploaded $file to bucket $panDomainBucket"
  done

  rm -f "$PUBLIC_KEY_FILE"
  rm -f "$PRIVATE_KEY_FILE"
  rm -f "$PANDA_PRIVATE_SETTINGS_FILE"
  rm -f "$PANDA_PUBLIC_SETTINGS_FILE"
}

setupGuardianPermissionConfiguration() {
  if [[ $LOCAL_AUTH != true ]]; then
    return
  fi

  echo "setting up permissions configuration for Guardian local auth"

  permissionsBucket=$(getStackResource "$AUTH_STACK_NAME" PermissionsBucket)

  target="$ROOT_DIR/dev/config/permissions.json"

  sed -e "s/@EMAIL_DOMAIN/$EMAIL_DOMAIN/g" \
    "$target.template" > "$target"

  aws s3 cp "$target" \
    "s3://$permissionsBucket/" \
    --endpoint-url $LOCALSTACK_ENDPOINT

  echo "  uploaded file to $permissionsBucket"
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

setupQuotasConfiguration () {
  echo "setting up quotas configuration"

  configBucket=$(getStackResource "$CORE_STACK_NAME" ConfigBucket)

  target="$ROOT_DIR/dev/config/rcs-quota.json"

  aws s3 cp "$target" \
    "s3://$configBucket/" \
    --endpoint-url $LOCALSTACK_ENDPOINT

  echo "  uploaded file to $configBucket"
}

setupUsagesData () {
  echo "setting up usages data"

  usageBucket=$(getStackResource "$CORE_STACK_NAME" UsageMailBucket)

  target="$ROOT_DIR/dev/config/usages.eml"

  aws s3 cp "$target" \
    "s3://$usageBucket/" \
    --endpoint-url $LOCALSTACK_ENDPOINT

  echo "  uploaded file to $usageBucket"
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

  for attempt in $(seq 1 15); do
    status="$(aws cloudformation describe-stacks --stack-name "$CORE_STACK_NAME" \
      --endpoint-url $LOCALSTACK_ENDPOINT | jq -r ".Stacks[0].StackStatus")"

    if [[ $status = "CREATE_COMPLETE" || $status = "UPDATE_COMPLETE" ]]; then
      echo "core stack created"
      return
    else
      echo "still waiting for core stack - status was $status"
      sleep 2
    fi
  done

  echo "cloudformation stack did not finish creating after 30s - what's gone wrong?"
  exit 1
}

createGuardianLocalAuthStack() {
  if [[ $LOCAL_AUTH != true ]]; then
    return
  fi

  echo "creating local auth cloudformation stack"

  aws cloudformation create-stack \
    --stack-name "$AUTH_STACK_NAME" \
    --template-body "file://$AUTH_STACK_FILE" \
    --endpoint-url $LOCALSTACK_ENDPOINT > /dev/null
  echo "  created stack $AUTH_STACK_NAME using $AUTH_STACK_FILENAME"
}

generateConfig() {
  CONF_HOME="${HOME}/.grid"
  mkdir -p ${CONF_HOME}
  echo "generating configuration files"
  pushd "$ROOT_DIR/dev/script/generate-config"
  npm install
  NO_AUTH=$NO_AUTH npm run generate-config
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
    if [[ $NO_AUTH != true ]]; then
      createGuardianLocalAuthStack
      setupPanDomainConfiguration
      setupGuardianPermissionConfiguration
    fi
  fi

  setupPhotographersConfiguration
  setupQuotasConfiguration
  setupUsagesData
  setupUsageRightsConfiguration
  setupDevNginx
  generateConfig
  uploadApiKey
  echo "Setup complete. You're now able to start Grid!"
}

main
