#!/bin/sh
if [ $# -lt 1 ]
then
    echo "usage: dev-ingest.sh <PROD_API_KEY> <TARGET_API_KEY> [local|test] [MAX_IMAGES]"
    echo
    echo "Pro tip: you can get an ingestion API key by running"
    echo
    echo "   $ aws s3 ls media-service-prod-keybucket-6ufulkzj8rxr | grep dev-ingest"
    echo
    exit 1
fi

DEV_INGEST_KEY=$1
TARGET_KEY=$2
TARGET_ENV=$3
LENGTH=$4

# defaults
if [ -z "$TARGET_ENV" ]; then
    TARGET_ENV="local"
fi
if [ -z "$LENGTH" ]; then
    LENGTH=40
fi

TARGET_BASE_URL="https://loader.media.$TARGET_ENV.dev-gutools.co.uk"

curl -H "X-Gu-Media-Key: $DEV_INGEST_KEY" https://api.media.gutools.co.uk/images?length=$LENGTH \
    | jq '.data[].data.source.secureUrl' \
    | cut -d '"' -f2 \
    | while read url
do
    echo Ingest...
    curl -s -o /tmp/img.jpg "$url"
    curl --data-binary @/tmp/img.jpg \
         -H "X-Gu-Media-Key: $TARGET_KEY" \
         $TARGET_BASE_URL/images
done
