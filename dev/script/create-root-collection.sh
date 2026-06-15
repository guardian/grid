#!/usr/bin/env bash

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR=${DIR}/../..

while [[ $# -gt 0 ]] && [[ "$1" == "--"* ]] ;
do
  opt="$1";
  shift;
  case "$opt" in
    "--api-key" )
      api_key="$1"; shift;;
    "--domain" )
      domain="$1"; shift;;
    "--name" )
      name="$1"; shift;;
    * )
      echo >&2 "Invalid option: $@"; exit 1;;
  esac
done

if [[ -z "$api_key" && -z "$domain" ]]; then
  echo >&2 "API key and domain unset, setting from dotenv file"
  # load values from .env into environment variables
  # see https://stackoverflow.com/a/30969768/3868241
  set -o allexport
  # shellcheck source=../.env
  source "$ROOT_DIR/dev/.env"
  set +o allexport
fi

if [[ -z "$api_key" || -z "$domain" || -z "$name" ]]; then
  echo >&2 "Missing setting(s).

Usage: $0 --api-key <key> --domain <domain> --name <name>

  --api-key   API key for authenticating grid access
  --domain    Root domain for grid instance (eg. local.dev-gutools.co.uk)
  --name      Name of new root collection"
  exit 1
fi

echo "creating root collection $name"

curl -s -X POST -H "X-Gu-Media-Key: $api_key" \
  -H "Content-Type: application/json" \
  -d '{ "data": "'"$name"'" }' \
  "https://media-collections.$domain/collections"

outcome="$?"

if [[ "$outcome" == "0" ]]; then
  echo "collection created"
else
  echo "creation failed..."
fi
