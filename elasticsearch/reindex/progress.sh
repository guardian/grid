#!/usr/bin/env bash

# Usage: [watch -t] ./progress.sh <current index doc count>

DOC_COUNT=$1
NEW_DOC_COUNT=$(curl --silent $ES_URL:9200/$NEW_INDEX/_count | jq ".count")

echo "($NEW_DOC_COUNT/$DOC_COUNT)*100" | bc -l
