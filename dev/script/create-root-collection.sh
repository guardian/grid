#!/usr/bin/env bash

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR=${DIR}/../..

COLLECTION_NAME=${1:-TEST}

# load values from .env into environment variables
# see https://stackoverflow.com/a/30969768/3868241
set -o allexport
# shellcheck source=../.env
source "$ROOT_DIR/dev/.env"
set +o allexport

echo "creating root collection $COLLECTION_NAME"

curl -s -X POST -H "X-Gu-Media-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "data": "'"$COLLECTION_NAME"'" }' \
  "https://media-collections.$DOMAIN/collections"
