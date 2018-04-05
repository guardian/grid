#!/usr/bin/env bash

# Downloads DEV config to /etc/gu

DOWNLOAD_DIR=/etc/gu

aws s3 cp s3://grid-conf/DEV/ \
    ${DOWNLOAD_DIR}/ \
    --recursive \
    --profile media-service \
    --region eu-west-1
