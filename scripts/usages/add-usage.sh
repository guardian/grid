#!/usr/bin/env bash

set -e

DOMAIN=$1
API_KEY=$2


if [[ -z ${DOMAIN} || -z ${API_KEY} ]]; then
  echo -e "\033[31mUsage: $0 <DOMAIN> <API_KEY>\033[0m"
  exit 1
fi

curl -X POST -k https://media-usage."${DOMAIN}"/usages/print \
  -H "X-Gu-Media-Key: ${API_KEY}" \
  -H "content-type: application/json" \
  -d @usage.json
