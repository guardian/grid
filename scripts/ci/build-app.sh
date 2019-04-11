#!/bin/bash

if [ -z "${TEAMCITY_BUILDCONF_NAME}" ]; then
    echo "No TEAMCITY_BUILDCONF_NAME env var set"
    exit 1
fi

sbt common-lib/clean \
    ${TEAMCITY_BUILDCONF_NAME}/clean \
    common-lib/test \
    ${TEAMCITY_BUILDCONF_NAME}/test \
    ${TEAMCITY_BUILDCONF_NAME}/riffRaffUpload