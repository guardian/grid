#!/bin/bash


if [[ -z "$1" ]]; then
  echo "Usage: $0 <name>"
  echo "  where <name> is the name of user or application which will use this key"
  exit 1
fi

GRID_USER_NAME="$1"
GRID_KEY_NAME="$(echo $GRID_USER_NAME | tr ' ' '_' | tr '[:upper:]' '[:lower:]')-$(openssl rand -base64 450 | tr -d '\n' | tr -d '/' | tr -d '+' | cut -c1-48)"

echo "$GRID_USER_NAME" > "$GRID_KEY_NAME"
echo "created key: $GRID_KEY_NAME"

