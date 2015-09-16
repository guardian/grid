#/bin/bash

QUEUE_URL=$1

aws sqs get-queue-attributes --queue-url $QUEUE_URL --attribute-names ApproximateNumberOfMessages --region eu-west-1 | jq -r ".Attributes.ApproximateNumberOfMessages"
