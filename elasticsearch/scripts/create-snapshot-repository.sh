#!/usr/bin/env bash

BUCKET_NAME=$1
AWS_REGION=$2


echo "Waiting for Elasticsearch to start before creating snapshot repo."

for i in {1..120}
do
    curl --output /dev/null --silent --fail http://localhost:9200/_cluster/health
    ESOK=$?

    if [ $ESOK -eq 0 ]
    then
        echo "Elasticsearch is available: trying to create repo in region: $AWS_REGION, bucket: $BUCKET_NAME"
        curl -i -XPUT --fail 'http://localhost:9200/_snapshot/s3' -d '{
            "type": "s3",
            "settings": {
                "bucket": "'$BUCKET_NAME'",
                "region": "'$AWS_REGION'"
            }
        }'
        $SNOK=$?

        if [ $SNOK -ne 0 ]
        then
            echo "Repo creation failed!"
        fi

        break
    else
        echo "."
        sleep 1
    fi
done

if [ $ESOK -ne 0 ]; then echo "Elasticsearch failed to respond with a 200 status code, snapshot repo not created!"; fi

