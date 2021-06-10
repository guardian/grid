#!/bin/zsh

function pingle() {
  set -o shwordsplit

  API="https://api.media.local.dev-gutools.co.uk/management/healthcheck"
  THRALL="https://thrall.media.local.dev-gutools.co.uk/management/healthcheck"
  IMAGE_LOADER="https://loader.media.local.dev-gutools.co.uk/management/healthcheck"
  KAHUNA="https://media.local.dev-gutools.co.uk/management/healthcheck"
  CROPPER="https://cropper.media.local.dev-gutools.co.uk/management/healthcheck"
  METADATA="https://media-metadata.local.dev-gutools.co.uk/management/healthcheck"
  USAGE="https://media-usage.local.dev-gutools.co.uk/management/healthcheck"
  COLLECTIONS="https://media-collections.local.dev-gutools.co.uk/management/healthcheck"
  AUTH="https://media-auth.local.dev-gutools.co.uk/management/healthcheck"
  LEASES="https://media-leases.local.dev-gutools.co.uk/management/healthcheck"
  ADMIN_TOOLS="https://admin-tools.media.local.dev-gutools.co.uk/management/healthcheck"
  INNER_SERVICE_STATUS="https://thrall.media.local.dev-gutools.co.uk/management/innerServiceStatusCheck?depth=2"


  lu="$COLLECTIONS $IMAGE_LOADER $CROPPER $METADATA $THRALL $INNER_SERVICE_STATUS $KAHUNA $API $USAGE $AUTH $LEASES $ADMIN_TOOLS"

  echo "      \033[35mPingling!\033[m"
  for URL in $lu
  do
    # Curl each endpoint waiting a maximum of 300ms for a response
    STATUS=`curl --fail -s -m 0.3 -w "%{http_code}" $URL -o /dev/null`
    EXITCODE=$?

    # If the status is 000 then this means a connect timeout
    if [[ "${STATUS}" == "000" ]]
    then
      STATUS="T/O"
    fi

    # Any error in red, otherwise green
    if [[ "${EXITCODE}" -eq "0" ]]
    then
      echo "\033[30m\033[42m $STATUS \033[m \033[32m${URL}\033[m"
    else
      echo "\033[30m\033[41m $STATUS \033[m \033[31;1m${URL}\033[m"
    fi
  done
}

if [[ "${1}" == "--pingle" ]]
then
  pingle
  exit 0
fi

SCRIPT=${0:A}
watch --color ${SCRIPT} --pingle
