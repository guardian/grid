#!/bin/bash -e

if [ -z "${TEAMCITY_BUILDCONF_NAME}" ]; then
    echo "No TEAMCITY_BUILDCONF_NAME env var set"
    exit 1
fi


docker login -u ${DOCKER_REPO_USER} --password-stdin <<EOF
${DOCKER_REPO_PASSWORD}
EOF

function cleanup {
  docker logout
}

trap cleanup EXIT

sbt common-lib/clean \
    ${TEAMCITY_BUILDCONF_NAME}/clean \
    common-lib/test \
    ${TEAMCITY_BUILDCONF_NAME}/test \
    ${TEAMCITY_BUILDCONF_NAME}/docker:publish \
    ${TEAMCITY_BUILDCONF_NAME}/riffRaffUpload
