#!/bin/sh
if [ $# -lt 1 ]
then
    echo "usage: dev-ingest.sh <PROD_API_KEY> [local|test] [MAX_IMAGES]"
    echo
    echo "Pro tip: you can get an ingestion API key by running"
    echo
    echo "   $ aws s3 ls ***REMOVED*** | grep dev-ingest"
    echo
    exit 1
fi

DEV_INGEST_KEY=$1
TARGET_ENV=$2
LENGTH=$3

# defaults
if [ -z "$TARGET_ENV" ]; then
    TARGET_ENV="local"
fi
if [ -z "$LENGTH" ]; then
    LENGTH=40
fi

TARGET_BASE_URL="https://loader.media.$TARGET_ENV.dev-***REMOVED***"

curl -H "X-Gu-Media-Key: $DEV_INGEST_KEY" https://api.media.***REMOVED***/images?length=$LENGTH \
    | jq '.data[].data.source.secureUrl' \
    | cut -d '"' -f2 \
    | while read url
do
    echo Ingest...
    curl -s -o /tmp/img.jpg "$url"
    curl --data-binary @/tmp/img.jpg $TARGET_BASE_URL/images
done
