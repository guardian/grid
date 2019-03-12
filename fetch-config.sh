#!/usr/bin/env bash

# Downloads DEV config to /etc/gu

set -e

# colours
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # no colour - reset console colour

DOWNLOAD_DIR=/etc/gu

downloadConfig() {
  aws s3 cp s3://grid-conf/DEV/ \
    ${DOWNLOAD_DIR}/ \
    --recursive \
    --profile media-service \
    --region eu-west-1
}

if [[ -w ${DOWNLOAD_DIR} ]]; then
  downloadConfig
  echo -e "${GREEN}Done ${NC}"
else
  echo "Cannot write to ${DOWNLOAD_DIR}. It either doesn't exist or is not owned by $(whoami)."

  echo "Creating ${DOWNLOAD_DIR} and making user $(whoami) the owner. Requires sudo access. Please enter password when prompted."
  sudo mkdir -p ${DOWNLOAD_DIR}
  sudo chown -R $(whoami):admin ${DOWNLOAD_DIR}

  downloadConfig
  echo -e "${GREEN}Done ${NC}"
fi
