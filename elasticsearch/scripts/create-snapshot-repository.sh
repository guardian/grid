#!/usr/bin/env bash

BUCKET_NAME=$1
AWS_REGION=$2

curl -XPUT 'http://localhost:9200/_snapshot/s3' -d '{
     "type": "s3",
     "settings": {
         "bucket": "'$BUCKET_NAME'",
         "region": "'$AWS_REGION'"
     }
}'
