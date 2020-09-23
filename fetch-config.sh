#!/usr/bin/env bash

# Downloads DEV config to ~/.grid

set -e

# colours
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # no colour - reset console colour

DOWNLOAD_DIR=${HOME}/.grid
mkdir -p "${DOWNLOAD_DIR}"

downloadConfig() {
  aws s3 cp s3://grid-conf/DEV/ \
    "${DOWNLOAD_DIR}"/ \
    --recursive \
    --profile media-service \
    --region eu-west-1
}

downloadConfig
echo -e "${GREEN}Done ${NC}"
