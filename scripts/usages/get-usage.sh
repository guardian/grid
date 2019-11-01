#!/usr/bin/env bash

set -e

DOMAIN=$1
IMAGE_ID=$2
API_KEY=$3

if [[ -z ${DOMAIN} || -z ${IMAGE_ID} || -z ${API_KEY} ]]; then
  echo -e "\033[31mUsage: $0 <DOMAIN> <IMAGE_ID> <API_KEY>\033[0m"
  exit 1
fi


curl -X GET -k https://media-usage."${DOMAIN}"/usages/media/"${IMAGE_ID}" \
  -H "X-Gu-Media-Key: ${API_KEY}"
