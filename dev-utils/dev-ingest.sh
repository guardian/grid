#!/bin/sh
if [ $# < 1 ]
then
    echo "usage: dev-ingest.sh <PROD_API_KEY>"
    echo
    echo "Pro tip: you can get an ingestion API key by running"
    echo
    echo "   $ aws s3 ls ***REMOVED*** | grep dev-ingest"
    echo
    exit 1
fi

DEV_INGEST_KEY=$1
LENGTH=$2||40

curl -H "X-Gu-Media-Key: $DEV_INGEST_KEY" https://api.media.***REMOVED***/images?length=$LENGTH \
    | jq '.data[].data.secureUrl' \
    | cut -d '"' -f2 \
    | while read url
do
    echo Ingest...
    curl -s -o /tmp/img.jpg "$url"
    curl --data-binary @/tmp/img.jpg http://localhost:9003/images
done
